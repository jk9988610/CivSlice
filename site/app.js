const MAX_COMPARE = 5;

const state = {
  regionId: null,
  periodId: null,
  swimlaneMembers: [],
  comparisonActive: [],
  focusCountryId: null,
  focusYear: -500,
  civilizations: [],
  civIndex: [],
  viewTab: 'profile',
  showAverage: false,
  showSpeculative: false,
  highlightedId: null,
  expandedCards: new Set(),
  radarLayout: null,
  lastEraTemplate: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function getRegion() { return CivNav.getRegion(state.regionId); }
function getPeriod() { return CivNav.getPeriod(state.regionId, state.periodId); }
function getCiv(id) { return state.civilizations.find((c) => c.id === id); }
function getFocusCiv() { return getCiv(state.focusCountryId); }
function getScopeCivs() {
  const period = getPeriod();
  if (!period) return [];
  return CivNav.civilizationsInScope(state.regionId, period, state.civilizations);
}
function getSwimlaneCivs() {
  return state.swimlaneMembers.map((id) => getCiv(id)).filter(Boolean);
}
function getComparisonCivs() {
  return state.comparisonActive.map((id) => getCiv(id)).filter(Boolean);
}

function resolveSnap(raw) { return CivTemplates.resolveSnapshot(raw); }

function resolveSnapForPeriod(raw) {
  const snap = resolveSnap(raw);
  const period = getPeriod();
  if (snap && period) return { ...snap, eraTemplate: period.eraTemplate };
  return snap;
}

function getSnapTolerance() {
  const period = getPeriod();
  return period ? CivNav.getSnapTolerance(period) : 350;
}

function findNearestSnapshotInPeriod(snapshots, year, period) {
  const inPeriod = CivNav.snapshotsInPeriod(snapshots, period);
  if (!inPeriod.length) return null;
  return inPeriod.reduce((best, snap) =>
    Math.abs(snap.year - year) < Math.abs(best.year - year) ? snap : best
  );
}

function isSnapInRange(snap, year) {
  const period = getPeriod();
  if (!period || !snap) return false;
  if (!CivNav.snapshotInPeriod(snap, period)) return false;
  return Math.abs(snap.year - year) <= getSnapTolerance();
}

function getResolvedSnap(civ, year) {
  const period = getPeriod();
  if (!period || !civ) return null;
  const raw = findNearestSnapshotInPeriod(civ.data.snapshots, year, period);
  if (!isSnapInRange(raw, year)) return null;
  return resolveSnapForPeriod(raw);
}

function findNearestSnapshotForAvg(snapshots, year) {
  const period = getPeriod();
  if (!period) return null;
  return findNearestSnapshotInPeriod(snapshots, year, period);
}

async function init() {
  const indexRes = await fetch('data/civilizations.json');
  const index = await indexRes.json();
  CivNav.init(index.meta);
  state.civIndex = index.civilizations;

  state.civilizations = await Promise.all(
    state.civIndex.map(async (entry) => {
      const res = await fetch(`data/${entry.file}`);
      return { ...entry, data: await res.json() };
    })
  );

  const defaultRegion = CivNav.findDefaultRegion();
  state.regionId = defaultRegion.id;
  const defaultPeriod = CivNav.findDefaultPeriod(state.regionId, state.civilizations);
  state.periodId = defaultPeriod?.id || null;

  initDownstreamFromPeriod();
  buildAllNav();
  buildMethodology(getFocusCiv() || getCiv('china'));
  bindEvents();
  CivRadar.resizeCanvas($('#radar-canvas'));
  render();
}

function initDownstreamFromPeriod() {
  const period = getPeriod();
  const available = getScopeCivs();

  if (!period || !available.length) {
    state.swimlaneMembers = [];
    state.comparisonActive = [];
    state.focusCountryId = null;
    state.focusYear = period?.yearMin ?? -500;
    return;
  }

  const defaults = available.slice(0, Math.min(2, available.length)).map((c) => c.id);
  state.swimlaneMembers = [...defaults];
  state.comparisonActive = [...defaults];
  state.focusCountryId = defaults[0];
  state.focusYear = CivNav.defaultYearForCiv(getFocusCiv(), period);
  state.lastEraTemplate = period.eraTemplate;
}

function resetDownstreamFromPeriod() {
  state.expandedCards.clear();
  state.highlightedId = null;
  initDownstreamFromPeriod();
}

function resetAllDownstream() {
  state.expandedCards.clear();
  state.highlightedId = null;
  const defaultPeriod = CivNav.findDefaultPeriod(state.regionId, state.civilizations);
  state.periodId = defaultPeriod?.id || null;
  initDownstreamFromPeriod();
}

function buildAllNav() {
  buildRegionTabs();
  buildPeriodTabs();
  buildCountryCheckboxes();
  applyPeriodToSlider();
  buildSwimlanes();
  buildTimelineTicks();
  buildSnapshotMarkers();
  buildComparisonPanel();
  updateNavVisibility();
}

function updateNavVisibility() {
  const isAntarctica = CivNav.isAntarcticaEmpty(state.regionId);
  $('#empty-region-msg').hidden = !isAntarctica;
  $('#period-row').hidden = isAntarctica;
  $('#country-row').hidden = isAntarctica;
  $('#swimlane-section').hidden = isAntarctica || !state.swimlaneMembers.length;
}

function buildRegionTabs() {
  $('#region-tabs').innerHTML = CivNav.getRegions().map((r) =>
    `<button type="button" class="region-tab ${r.id === state.regionId ? 'active' : ''}" data-region="${r.id}" role="tab">${r.label}</button>`
  ).join('');
}

function buildPeriodTabs() {
  const region = getRegion();
  const periods = region?.periods || [];
  $('#period-tabs').innerHTML = periods.map((p) =>
    `<button type="button" class="period-tab ${p.id === state.periodId ? 'active' : ''}" data-period="${p.id}" role="tab">${p.label}</button>`
  ).join('');
}

function buildCountryCheckboxes() {
  const el = $('#country-checkboxes');
  const available = getScopeCivs();

  if (!available.length) {
    el.innerHTML = '<p class="muted empty-period">该时段暂无文明记录，欢迎贡献数据</p>';
    return;
  }

  el.innerHTML = available.map((civ) => {
    const checked = state.swimlaneMembers.includes(civ.id);
    return `
      <label class="country-chip ${checked ? 'selected' : ''}">
        <input type="checkbox" name="country-select" value="${civ.id}" ${checked ? 'checked' : ''}>
        <span class="civ-dot" style="background:${civ.color}"></span>
        <span>${civ.name}</span>
      </label>`;
  }).join('');
}

function buildComparisonPanel() {
  const el = $('#comparison-toggles');
  const members = getSwimlaneCivs();

  if (!members.length) {
    el.innerHTML = '<p class="muted">请先勾选国家加入泳道</p>';
    return;
  }

  el.innerHTML = members.map((civ) => {
    const active = state.comparisonActive.includes(civ.id);
    const isFocus = civ.id === state.focusCountryId;
    return `
      <label class="comparison-toggle ${active ? 'active' : ''} ${isFocus ? 'focus' : ''}">
        <input type="checkbox" name="comparison-active" value="${civ.id}" ${active ? 'checked' : ''}>
        <span class="civ-dot" style="background:${civ.color}"></span>
        <span>${civ.name}</span>
        ${isFocus ? '<span class="focus-badge">聚焦</span>' : ''}
      </label>`;
  }).join('');
}

function applyPeriodToSlider() {
  const period = getPeriod();
  const slider = $('#year-slider');
  if (!period) {
    slider.disabled = true;
    $('#period-range').textContent = '';
    return;
  }
  slider.disabled = false;
  const step = CivNav.getYearStep(period.yearMin, period.yearMax);
  slider.min = period.yearMin;
  slider.max = period.yearMax;
  slider.step = step;
  slider.value = state.focusYear;
  const region = getRegion();
  $('#period-range').textContent = CivNav.formatScopeLabel(region, period, formatYear);
  $('#scope-label').textContent = CivNav.formatScopeLabel(region, period, formatYear);
}

function buildTimelineTicks() {
  const period = getPeriod();
  if (!period) return;
  const count = 6;
  const step = (period.yearMax - period.yearMin) / (count - 1);
  $('#timeline-ticks').innerHTML = Array.from({ length: count }, (_, i) =>
    `<span>${formatYear(Math.round(period.yearMin + step * i))}</span>`
  ).join('');
}

function buildSnapshotMarkers() {
  const period = getPeriod();
  const focus = getFocusCiv();
  if (!period || !focus) {
    $('#snapshot-markers').innerHTML = '';
    return;
  }
  const snaps = CivNav.snapshotsInPeriod(focus.data.snapshots, period);
  const range = period.yearMax - period.yearMin;
  if (!range) return;

  $('#snapshot-markers').innerHTML = snaps.map((snap) => {
    const pct = ((snap.year - period.yearMin) / range) * 100;
    const label = snap.group || snap.eraLabel;
    return `<button type="button" class="snap-marker" style="left:${pct}%" title="${formatYear(snap.year)} · ${label}" data-year="${snap.year}"></button>`;
  }).join('');

  $$('.snap-marker').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.focusYear = Number(btn.dataset.year);
      $('#year-slider').value = state.focusYear;
      render();
    });
  });
}

function buildSwimlanes() {
  const period = getPeriod();
  const section = $('#swimlane-section');
  if (!period || !state.swimlaneMembers.length) {
    section.hidden = true;
    return;
  }

  const rows = CivNav.swimlanes(period, state.civilizations, state.swimlaneMembers);
  if (!rows.length) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  const range = period.yearMax - period.yearMin;
  const tickCount = 5;
  const tickStep = range / (tickCount - 1);

  $('#swimlane-axis').innerHTML = Array.from({ length: tickCount }, (_, i) => {
    const year = Math.round(period.yearMin + tickStep * i);
    const pct = (i / (tickCount - 1)) * 100;
    return `<span class="swimlane-axis-tick" style="left:${pct}%">${formatYearShort(year)}</span>`;
  }).join('');

  $('#swimlane-lanes').innerHTML = rows.map((row) => renderSwimlaneRow(row, period, range)).join('');
}

function renderSwimlaneRow(row, period, range) {
  const isFocus = row.civId === state.focusCountryId;
  const inCompare = state.comparisonActive.includes(row.civId);

  let presenceHtml = '';
  if (row.presence) {
    const start = Math.max(row.presence.start, period.yearMin);
    const end = Math.min(row.presence.end, period.yearMax);
    const left = ((start - period.yearMin) / range) * 100;
    const width = ((end - start) / range) * 100;
    presenceHtml = `<span class="swimlane-presence" style="left:${left}%;width:${width}%" title="${row.presence.label}"></span>`;
  }

  const markersHtml = row.markers.map((snap) => {
    const pct = ((snap.year - period.yearMin) / range) * 100;
    const label = snap.group || snap.eraLabel;
    const title = `${label} · ${formatYear(snap.year)}`;
    const active = snap.year === state.focusYear && row.civId === state.focusCountryId;
    return `<button type="button" class="swimlane-marker ${active ? 'active' : ''}" style="left:${pct}%" data-civ="${row.civId}" data-year="${snap.year}" title="${title}" aria-label="${title}"></button>`;
  }).join('');

  return `
    <div class="swimlane-row ${isFocus ? 'primary' : ''} ${inCompare ? 'highlighted' : ''}" style="--lane-color:${row.color}" data-civ="${row.civId}">
      <span class="swimlane-label" title="${row.name}">${row.name}</span>
      <div class="swimlane-track">${presenceHtml}${markersHtml}</div>
    </div>`;
}

function updateSwimlaneHighlights() {
  if ($('#swimlane-section').hidden) return;
  $$('.swimlane-row').forEach((row) => {
    const civId = row.dataset.civ;
    row.classList.toggle('primary', civId === state.focusCountryId);
    row.classList.toggle('highlighted', state.comparisonActive.includes(civId));
  });
  $$('.swimlane-marker').forEach((m) => {
    const active = Number(m.dataset.year) === state.focusYear && m.dataset.civ === state.focusCountryId;
    m.classList.toggle('active', active);
  });
}

function onRegionChange(regionId) {
  if (regionId === state.regionId) return;
  state.regionId = regionId;
  resetAllDownstream();
  buildAllNav();
  if (getFocusCiv()) buildMethodology(getFocusCiv());
  render();
}

function onPeriodChange(periodId) {
  if (periodId === state.periodId) return;
  state.periodId = periodId;
  resetDownstreamFromPeriod();
  buildPeriodTabs();
  buildCountryCheckboxes();
  applyPeriodToSlider();
  buildSwimlanes();
  buildTimelineTicks();
  buildSnapshotMarkers();
  buildComparisonPanel();
  updateNavVisibility();
  if (getFocusCiv()) buildMethodology(getFocusCiv());
  render();
}

function onCountryToggle(countryId, checked) {
  if (checked) {
    if (!state.swimlaneMembers.includes(countryId)) {
      state.swimlaneMembers.push(countryId);
      if (!state.comparisonActive.includes(countryId)) {
        state.comparisonActive.push(countryId);
      }
    }
    if (!state.focusCountryId) {
      state.focusCountryId = countryId;
      const period = getPeriod();
      state.focusYear = CivNav.defaultYearForCiv(getCiv(countryId), period);
    }
  } else {
    state.swimlaneMembers = state.swimlaneMembers.filter((id) => id !== countryId);
    state.comparisonActive = state.comparisonActive.filter((id) => id !== countryId);
    if (state.focusCountryId === countryId) {
      state.focusCountryId = state.swimlaneMembers[0] || null;
      if (state.focusCountryId) {
        const period = getPeriod();
        state.focusYear = CivNav.defaultYearForCiv(getCiv(state.focusCountryId), period);
      }
    }
  }
  buildCountryCheckboxes();
  buildSwimlanes();
  buildSnapshotMarkers();
  buildComparisonPanel();
  updateNavVisibility();
  if (getFocusCiv()) buildMethodology(getFocusCiv());
  render();
}

function onComparisonToggle(countryId, checked) {
  if (checked) {
    if (state.swimlaneMembers.includes(countryId) && !state.comparisonActive.includes(countryId)) {
      if (state.comparisonActive.length >= MAX_COMPARE) {
        flashHint(`对比雷达最多同时绘制 ${MAX_COMPARE} 国`);
        return false;
      }
      state.comparisonActive.push(countryId);
    }
  } else {
    state.comparisonActive = state.comparisonActive.filter((id) => id !== countryId);
  }
  buildComparisonPanel();
  render();
  return true;
}

function onSwimlaneMarkerClick(civId, year) {
  state.focusCountryId = civId;
  state.focusYear = year;
  state.expandedCards.clear();
  state.highlightedId = null;
  $('#year-slider').value = year;
  buildComparisonPanel();
  buildSnapshotMarkers();
  buildSwimlanes();
  if (getFocusCiv()) buildMethodology(getFocusCiv());
  render();
}

function onSwimlaneRowClick(civId) {
  const civ = getCiv(civId);
  const period = getPeriod();
  if (!civ || !period) return;
  state.focusCountryId = civId;
  state.focusYear = CivNav.defaultYearForCiv(civ, period);
  state.expandedCards.clear();
  state.highlightedId = null;
  $('#year-slider').value = state.focusYear;
  buildComparisonPanel();
  buildSnapshotMarkers();
  buildSwimlanes();
  if (getFocusCiv()) buildMethodology(getFocusCiv());
  render();
}

function buildMethodology(civ) {
  if (!civ) return;
  const source = civ.data.meta.methodology ? civ : getCiv('china');
  const methodology = source?.data.meta.methodology;
  if (!methodology) return;
  $('#methodology-list').innerHTML = methodology.principles.map((p) => `<li>${p}</li>`).join('');
  $('#confidence-dl').innerHTML = Object.entries(methodology.confidenceLevels)
    .map(([k, v]) => `<dt>${civ.data.confidenceLabels[k]}</dt><dd>${v}</dd>`).join('');
  const rejected = civ.data.meta.rejectedHypotheses || getCiv('china')?.data.meta.rejectedHypotheses;
  $('.rejected-card')?.remove();
  if (rejected?.length) {
    const card = document.createElement('div');
    card.className = 'info-card rejected-card';
    card.innerHTML = `<h3>已反驳假说（国家级）</h3><ul class="rejected-list">${rejected.map(renderRejectedItem).join('')}</ul>`;
    $('.sidebar').appendChild(card);
  }
  $('#page-subtitle').textContent = civ.data.meta.subtitle;
}

function bindEvents() {
  $('#region-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.region-tab');
    if (btn) onRegionChange(btn.dataset.region);
  });

  $('#period-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.period-tab');
    if (btn) onPeriodChange(btn.dataset.period);
  });

  $('#country-checkboxes').addEventListener('change', (e) => {
    const target = e.target;
    if (!target.matches('input[name="country-select"]')) return;
    onCountryToggle(target.value, target.checked);
  });

  $('#comparison-toggles').addEventListener('change', (e) => {
    const target = e.target;
    if (!target.matches('input[name="comparison-active"]')) return;
    const ok = onComparisonToggle(target.value, target.checked);
    if (!ok) target.checked = !target.checked;
  });

  $('#compare-select-all').addEventListener('click', () => {
    const ids = state.swimlaneMembers.slice(0, MAX_COMPARE);
    state.comparisonActive = [...ids];
    buildComparisonPanel();
    render();
  });

  $('#compare-select-none').addEventListener('click', () => {
    state.comparisonActive = [];
    buildComparisonPanel();
    render();
  });

  $('#swimlane-lanes').addEventListener('click', (e) => {
    const marker = e.target.closest('.swimlane-marker');
    if (marker) {
      e.stopPropagation();
      onSwimlaneMarkerClick(marker.dataset.civ, Number(marker.dataset.year));
      return;
    }
    const row = e.target.closest('.swimlane-row');
    if (row) onSwimlaneRowClick(row.dataset.civ);
  });

  $('#year-slider').addEventListener('input', (e) => {
    state.focusYear = Number(e.target.value);
    render();
  });
  $('#btn-prev').addEventListener('click', () => stepYear(-1));
  $('#btn-next').addEventListener('click', () => stepYear(1));

  $('#view-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-tab');
    if (!btn) return;
    const view = btn.dataset.view;
    if (view === state.viewTab) return;
    state.viewTab = view;
    state.highlightedId = null;
    state.expandedCards.clear();
    if (view === 'profile') {
      state.showAverage = false;
      $('#toggle-average').checked = false;
      $('#profile-toggles').hidden = false;
      $('#compare-toggles').hidden = true;
    } else {
      $('#profile-toggles').hidden = true;
      $('#compare-toggles').hidden = false;
    }
    $$('.view-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    render();
  });

  $('#toggle-speculative').addEventListener('change', (e) => {
    state.showSpeculative = e.target.checked;
    render();
  });

  $('#toggle-average').addEventListener('change', (e) => {
    state.showAverage = e.target.checked;
    render();
  });

  const canvas = $('#radar-canvas');
  canvas.addEventListener('mousemove', onRadarMouseMove);
  canvas.addEventListener('mouseleave', () => {
    state.highlightedId = null;
    updateCardHighlights();
    drawRadar();
  });

  window.addEventListener('resize', () => {
    CivRadar.resizeCanvas($('#radar-canvas'));
    render();
  });
}

function flashHint(msg) {
  let el = $('.mode-hint') || Object.assign(document.createElement('p'), { className: 'mode-hint' });
  if (!el.parentElement) $('#viz-controls').appendChild(el);
  el.textContent = msg;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.textContent = ''; }, 2500);
}

function stepYear(dir) {
  const period = getPeriod();
  if (!period) return;
  const step = CivNav.getYearStep(period.yearMin, period.yearMax);
  state.focusYear = Math.max(period.yearMin, Math.min(period.yearMax, state.focusYear + dir * step));
  $('#year-slider').value = state.focusYear;
  render();
}

function formatYear(year) {
  if (year < 0) return `公元前 ${Math.abs(year)} 年`;
  if (year === 0) return '公元元年';
  return `公元 ${year} 年`;
}

function formatYearShort(year) {
  if (year < 0) return `前${Math.abs(year)}`;
  return `${year}`;
}

function updateTemplateBanner(snap) {
  const banner = $('#template-banner');
  const period = getPeriod();
  const eraTemplate = period?.eraTemplate || snap?.eraTemplate;
  if (!eraTemplate) { banner.hidden = true; return; }

  const tpl = CivTemplates.getTemplate(eraTemplate);
  const legacyNote = snap?._fromLegacy ? ' <span class="legacy-tag">（旧十维映射）</span>' : '';
  if (state.lastEraTemplate && state.lastEraTemplate !== eraTemplate) {
    const prev = CivTemplates.getTemplate(state.lastEraTemplate);
    banner.hidden = false;
    banner.className = 'template-banner template-changed';
    banner.innerHTML = `维度集已切换：<strong>${prev.label}</strong> → <strong>${tpl.label}</strong>`;
  } else {
    banner.hidden = false;
    banner.className = 'template-banner';
    banner.innerHTML = `时代模板：<strong>${tpl.label}</strong>${legacyNote}`;
  }
  state.lastEraTemplate = eraTemplate;
}

function checkCompareTemplateMismatch() {
  if (state.viewTab !== 'compare' || state.comparisonActive.length < 2) return '';
  const period = getPeriod();
  const templates = getComparisonCivs().map((civ) => {
    const snap = getResolvedSnap(civ, state.focusYear);
    return snap?.eraTemplate || period?.eraTemplate;
  }).filter(Boolean);
  const unique = [...new Set(templates)];
  if (unique.length > 1) {
    return `<p class="template-warn">⚠ 时代模板不一致（${unique.map((id) => CivTemplates.getTemplate(id).label).join(' vs ')}）</p>`;
  }
  return '';
}

function renderRejectedItem(item) {
  const conf = getFocusCiv()?.data.confidenceLabels[item.confidence] || item.confidence;
  return `<li><span class="rejected-claim">${item.claim}</span><span class="rejected-refute">反驳：${item.refutedBy}</span><span class="dim-badge badge-${item.confidence}">${conf}</span></li>`;
}

function renderEvidenceTypes(types) {
  const labels = getFocusCiv()?.data.meta.evidenceTypeLabels || {};
  if (!types?.length) return '';
  return `<div class="evidence-types"><strong>史料类型</strong><div class="tag-row">${types.map((t) => `<span class="tag tag-${t}">${labels[t] || t}</span>`).join('')}</div></div>`;
}

function renderSourceItem(src) {
  if (typeof src === 'string') return `<li>${src}</li>`;
  const typeLabel = getFocusCiv()?.data.meta.sourceTypeLabels?.[src.type] || src.type;
  const note = src.note ? ` <span class="source-note">— ${src.note}</span>` : '';
  return `<li><span class="source-type">[${typeLabel}]</span> ${src.ref}${note}</li>`;
}

function render() {
  const period = getPeriod();
  const focus = getFocusCiv();
  const raw = period && focus
    ? findNearestSnapshotInPeriod(focus.data.snapshots, state.focusYear, period)
    : null;
  const inRange = isSnapInRange(raw, state.focusYear);
  const snap = inRange ? getResolvedSnap(focus, state.focusYear) : null;

  $('#year-display').textContent = focus ? formatYear(state.focusYear) : '—';
  $('#era-label').textContent = inRange && raw
    ? (raw.group ? `${raw.group}（${raw.eraLabel}）` : raw.eraLabel)
    : focus ? '该时段无快照' : '请选择国家';

  $('#world-context').textContent = !focus
    ? '请勾选国家加入泳道，或切换区域/时段。'
    : inRange && raw?.worldContext
      ? `世界背景：${raw.worldContext}`
      : raw
        ? `最近快照：${formatYear(raw.year)}（${raw.group || raw.eraLabel}）`
        : '该时段无记录。';

  const isProfile = state.viewTab === 'profile';
  $('#radar-legend-profile').hidden = !isProfile;
  $('#radar-legend-compare').hidden = isProfile;
  $('#cards-title').textContent = isProfile ? '维度详情' : '派生指标';
  $('#cards-hint').textContent = isProfile ? '悬停联动 · 点击展开摘要' : '悬停联动 · 点击展开构成';

  updateTemplateBanner(snap);
  updateAverageToggle();
  renderSnapshotInfo(snap, raw, inRange);
  renderCards(inRange, snap);
  drawRadar();
  updateMarkerHighlight(raw);
  updateSwimlaneHighlights();
  renderAuxLabels();
}

function updateAverageToggle() {
  if (state.viewTab !== 'compare') return;
  const tolerance = getSnapTolerance();
  const civs = getComparisonCivs();
  const avgInfo = civs.length >= 2 ? CivStats.periodAverageAllStats(
    state.focusYear, civs, tolerance, findNearestSnapshotForAvg, isSnapInRange, resolveSnapForPeriod
  ) : null;
  const wrap = $('#avg-toggle-wrap');
  const checkbox = $('#toggle-average');
  if (!avgInfo) {
    wrap.classList.add('disabled');
    checkbox.disabled = true;
    if (state.showAverage) { state.showAverage = false; checkbox.checked = false; }
  } else {
    wrap.classList.remove('disabled');
    checkbox.disabled = false;
  }
}

function renderSnapshotInfo(snap, raw, inRange) {
  const el = $('#snapshot-info');
  const civ = getFocusCiv();
  const period = getPeriod();

  if (!civ) {
    el.innerHTML = '<h3>未选择国家</h3><p class="muted">请勾选国家加入泳道。</p>';
    return;
  }
  if (!inRange || !snap) {
    el.innerHTML = `<h3>暂无精确快照</h3><p class="muted">请拖动滑块至圆点附近。</p>${raw ? `<p class="muted">最近：<strong>${raw.group || raw.eraLabel}</strong>（${formatYear(raw.year)}）</p>` : ''}`;
    return;
  }

  const tpl = CivTemplates.getTemplate(period.eraTemplate);
  const compareNote = state.viewTab === 'compare' && state.comparisonActive.length > 1
    ? `<p class="compare-note muted">对比参与：${getComparisonCivs().map((c) => c.name).join('、')}</p>` : '';
  const statsBlock = state.viewTab === 'compare' ? renderStatsSummary(snap) : '';

  el.innerHTML = `
    <h3 style="color:${civ.color}">${civ.data.meta.country}</h3>
    <p class="era-badge">${raw.group || raw.eraLabel}</p>
    <p class="template-badge">时代模板：${tpl.label}</p>
    ${compareNote}
    ${checkCompareTemplateMismatch()}
    ${statsBlock}
    ${renderEvidenceTypes(raw.evidenceTypes)}
    <p class="evidence-note"><strong>证据说明：</strong>${raw.evidenceNote}</p>
    ${raw.sources?.length ? `<div class="sources"><strong>参考来源</strong><ul>${raw.sources.map(renderSourceItem).join('')}</ul></div>` : ''}
    <p class="snap-diff muted">快照 ${formatYear(raw.year)}</p>`;
}

function renderStatsSummary(snap) {
  const stats = CivStats.computeAllStats(snap, snap.eraTemplate);
  const items = CivStats.STAT_DEFINITIONS.map((s) => {
    const v = stats[s.id];
    return `<span class="stat-pill">${s.short} ${v ?? '—'} <em>${CivStats.getGrade(v)}</em></span>`;
  }).join('');
  return `<div class="stats-summary">${items}</div>`;
}

function renderCards(inRange, snap) {
  const grid = $('#dimension-grid');
  grid.className = 'dimension-grid';
  if (!getFocusCiv()) {
    grid.innerHTML = '<p class="no-data">请勾选国家加入泳道。</p>';
    return;
  }
  if (!inRange || !snap) {
    grid.innerHTML = '<p class="no-data">该时段无记录，请跳转至有快照的年代。</p>';
    return;
  }

  if (state.viewTab === 'profile') {
    grid.classList.add('profile-grid');
    const axes = CivTemplates.getTemplateAxes(snap.eraTemplate);
    grid.innerHTML = axes.map((dim) => renderProfileCard(dim, snap)).join('');
  } else {
    grid.classList.add('compare-grid');
    const compareCivs = getComparisonCivs();
    if (!compareCivs.length) {
      grid.innerHTML = '<p class="no-data">请至少选择一国参与比较。</p>';
      return;
    }
    if (compareCivs.length > 1) {
      grid.innerHTML = CivStats.STAT_DEFINITIONS.map((stat) => renderStatCompareRow(stat)).join('');
    } else {
      grid.innerHTML = CivStats.STAT_DEFINITIONS.map((stat) => renderStatCard(stat, snap)).join('');
    }
  }
  bindCardEvents(grid);
}

function renderProfileCard(dim, snap) {
  const civ = getFocusCiv();
  const d = snap.dimensions[dim.id] || { confidence: 'absent', summary: '', level: null };
  const conf = d.confidence || 'absent';
  const label = civ.data.confidenceLabels[conf] || conf;
  const expanded = state.expandedCards.has(dim.id);
  const noteHtml = d.note ? `<p class="dim-note">${d.note}</p>` : '';
  const rubric = dim.rubric ? ` title="${dim.rubric}"` : '';
  if (conf === 'absent') {
    return `<div class="dim-card confidence-absent" data-card-id="${dim.id}"${rubric}><div class="dim-header"><span class="dim-label">${dim.label}</span><span class="dim-badge badge-absent">${label}</span></div><p class="dim-summary">—</p></div>`;
  }
  const barWidth = d.level ? (d.level / 5) * 100 : 0;
  return `<div class="dim-card confidence-${conf} ${expanded ? 'expanded' : ''}" data-card-id="${dim.id}"${rubric}>
    <div class="dim-header"><span class="dim-label">${dim.label}</span><span class="dim-badge badge-${conf}">${label}</span></div>
    <div class="dim-level-bar"><span class="dim-level-fill" style="width:${barWidth}%"></span><span class="dim-level-text">${d.level}/5</span></div>
    <p class="dim-summary">${d.summary}</p>${noteHtml}</div>`;
}

function renderStatCard(stat, snap) {
  const stats = CivStats.computeAllStats(snap, snap.eraTemplate);
  const value = stats[stat.id];
  const grade = CivStats.getGrade(value);
  const expanded = state.expandedCards.has(stat.id);
  const dimMap = CivTemplates.getDimensionMap(snap.eraTemplate);
  const formula = CivStats.formatBreakdown(CivStats.getStatBreakdown(snap, stat.id, dimMap, snap.eraTemplate));
  return `<div class="stat-card ${expanded ? 'expanded' : ''} ${value == null ? 'stat-na' : ''}" data-card-id="${stat.id}">
    <div class="stat-card-header"><span class="stat-name">${stat.label}</span><span class="stat-grade grade-${grade}">${grade}</span><span class="stat-value">${value ?? 'N/A'}</span></div>
    <div class="stat-bar"><span class="stat-bar-fill" style="width:${value ?? 0}%"></span></div>
    <p class="stat-formula ${expanded ? '' : 'clamped'}">${formula}</p></div>`;
}

function renderStatCompareRow(stat) {
  const expanded = state.expandedCards.has(stat.id);
  const entries = getComparisonCivs().map((civ) => {
    const s = getResolvedSnap(civ, state.focusYear);
    if (!s) return `<div class="compare-entry" style="--civ-color:${civ.color}"><span class="compare-civ">${civ.name}</span><span class="muted">无快照</span></div>`;
    const stats = CivStats.computeAllStats(s, s.eraTemplate);
    const value = stats[stat.id];
    const grade = CivStats.getGrade(value);
    return `<div class="compare-entry" style="--civ-color:${civ.color}">
      <span class="compare-civ">${civ.name}</span>
      <span class="compare-meta"><span class="stat-value-inline">${value ?? 'N/A'}</span> <span class="stat-grade grade-${grade}">${grade}</span></span>
    </div>`;
  }).join('');
  return `<div class="stat-compare-row ${expanded ? 'expanded' : ''}" data-card-id="${stat.id}">
    <h4 class="compare-dim-title">${stat.label}</h4><div class="compare-entries">${entries}</div></div>`;
}

function bindCardEvents(grid) {
  grid.querySelectorAll('[data-card-id]').forEach((card) => {
    const id = card.dataset.cardId;
    card.addEventListener('mouseenter', () => { state.highlightedId = id; updateCardHighlights(); drawRadar(); });
    card.addEventListener('mouseleave', () => { state.highlightedId = null; updateCardHighlights(); drawRadar(); });
    card.addEventListener('click', () => {
      state.expandedCards.has(id) ? state.expandedCards.delete(id) : state.expandedCards.add(id);
      card.classList.toggle('expanded');
    });
  });
  updateCardHighlights();
}

function updateCardHighlights() {
  $$('[data-card-id]').forEach((el) => {
    el.classList.toggle('highlighted', el.dataset.cardId === state.highlightedId);
  });
}

function renderAuxLabels() {
  const aux = $('#radar-aux-label');
  const legend = $('#compare-legend');
  const compareCivs = getComparisonCivs();

  if (state.viewTab === 'compare' && compareCivs.length > 1) {
    legend.hidden = false;
    legend.innerHTML = compareCivs.map((civ, i) => {
      const s = getResolvedSnap(civ, state.focusYear);
      const era = s ? s.eraLabel : '无快照';
      return `<span class="legend-item"><span class="civ-dot" style="background:${civ.color}"></span>${civ.name} · ${era}${civ.id === state.focusCountryId ? '（聚焦）' : ''}</span>`;
    }).join('');
  } else {
    legend.hidden = true;
  }

  if (state.viewTab === 'compare' && state.showAverage && compareCivs.length >= 2) {
    const tolerance = getSnapTolerance();
    const avg = CivStats.periodAverageAllStats(
      state.focusYear, compareCivs, tolerance, findNearestSnapshotForAvg, isSnapInRange, resolveSnapForPeriod
    );
    if (avg) {
      aux.hidden = false;
      aux.textContent = `比较参与均值（n=${avg.civCount}）`;
      return;
    }
  }

  if (state.viewTab === 'profile' && state.showSpeculative) {
    aux.hidden = false;
    aux.textContent = '实线：有据+推断 · 虚线：含猜测';
    return;
  }
  aux.hidden = true;
}

function drawRadar() {
  const canvas = $('#radar-canvas');
  const ctx = canvas.getContext('2d');
  const period = getPeriod();
  const focus = getFocusCiv();
  const snap = focus ? getResolvedSnap(focus, state.focusYear) : null;

  if (state.viewTab === 'profile') {
    const eraTemplate = period?.eraTemplate || snap?.eraTemplate || 'iron_imperial';
    const axes = CivTemplates.getTemplateAxes(eraTemplate).map((d) => ({ id: d.id, short: d.short }));
    const layout = CivRadar.buildLayout(canvas, axes, 5);
    state.radarLayout = layout;
    CivRadar.drawProfileRadar(ctx, layout, {
      snapshot: snap,
      color: focus?.color || '#b22222',
      showSpeculative: state.showSpeculative,
      showAverage: false,
      highlightedId: state.highlightedId,
    });
  } else {
    const compareCivs = getComparisonCivs();
    const axes = CivStats.STAT_DEFINITIONS.map((s) => ({ id: s.id, short: s.short }));
    const layout = CivRadar.buildLayout(canvas, axes, 100);
    state.radarLayout = layout;

    const statsList = [];
    const colors = [];
    compareCivs.forEach((civ) => {
      const s = getResolvedSnap(civ, state.focusYear);
      if (s) {
        statsList.push(CivStats.computeAllStats(s, s.eraTemplate));
        colors.push(civ.color);
      }
    });

    let avgStats = null;
    if (state.showAverage && compareCivs.length >= 2) {
      const tolerance = getSnapTolerance();
      const avg = CivStats.periodAverageAllStats(
        state.focusYear, compareCivs, tolerance, findNearestSnapshotForAvg, isSnapInRange, resolveSnapForPeriod
      );
      avgStats = avg?.stats;
    }

    CivRadar.drawCompareRadar(ctx, layout, {
      statsList,
      colors,
      showAverage: state.showAverage,
      avgStats,
      highlightedId: state.highlightedId,
    });
  }
}

function updateMarkerHighlight(snap) {
  $$('.snap-marker').forEach((m) => {
    m.classList.toggle('active', snap && Number(m.dataset.year) === snap.year);
  });
}

function onRadarMouseMove(e) {
  const canvas = $('#radar-canvas');
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (!state.radarLayout) return;
  const newId = CivRadar.hitTest(state.radarLayout, x, y);
  if (newId !== state.highlightedId) {
    state.highlightedId = newId;
    updateCardHighlights();
    drawRadar();
  }
}

init().catch(console.error);
