const MAX_COMPARE = 3;

const state = {
  selectedPeriodId: null,
  selectedGroupId: null,
  currentYear: -500,
  civilizations: [],
  civIndex: [],
  viewTab: 'profile',
  primaryCivId: 'china',
  selectedCivIds: ['china'],
  showAverage: false,
  showSpeculative: false,
  highlightedId: null,
  expandedCards: new Set(),
  radarLayout: null,
  lastEraTemplate: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function resolveSnap(raw) {
  return CivTemplates.resolveSnapshot(raw);
}

function resolveSnapForPeriod(raw) {
  const snap = resolveSnap(raw);
  const period = getPeriod();
  if (snap && period) return { ...snap, eraTemplate: period.eraTemplate };
  return snap;
}

function getPeriod() {
  return state.selectedPeriodId ? CivNav.getPeriod(state.selectedPeriodId) : null;
}

function getSnapTolerance() {
  const period = getPeriod();
  return period ? CivNav.getSnapTolerance(period) : 350;
}

function getResolvedSnap(civ, year) {
  const period = getPeriod();
  if (!period) return null;
  const raw = findNearestSnapshotInPeriod(civ.data.snapshots, year, period);
  if (!isSnapInRange(raw, year)) return null;
  return resolveSnapForPeriod(raw);
}

function findNearestSnapshotInPeriod(snapshots, year, period) {
  const inPeriod = CivNav.snapshotsInPeriod(snapshots, period);
  if (!inPeriod.length) return null;
  return inPeriod.reduce((best, snap) =>
    Math.abs(snap.year - year) < Math.abs(best.year - year) ? snap : best
  );
}

function findNearestSnapshotForAvg(snapshots, year) {
  const period = getPeriod();
  if (!period) return null;
  return findNearestSnapshotInPeriod(snapshots, year, period);
}

async function init() {
  const indexRes = await fetch('data/civilizations.json');
  const index = await indexRes.json();
  state.civIndex = index.civilizations;

  state.civilizations = await Promise.all(
    state.civIndex.map(async (entry) => {
      const res = await fetch(`data/${entry.file}`);
      return { ...entry, data: await res.json() };
    })
  );

  const defaultPeriod = CivNav.findDefaultPeriod(state.civilizations);
  state.selectedPeriodId = defaultPeriod.id;

  const primary = getPrimaryCiv();
  state.currentYear = CivNav.defaultYearForPeriod(primary, defaultPeriod, null);

  const initSnap = getResolvedSnap(primary, state.currentYear);
  state.lastEraTemplate = initSnap?.eraTemplate || defaultPeriod.eraTemplate;

  $('#page-subtitle').textContent = primary.data.meta.subtitle;
  buildEraPeriodTabs();
  applyPeriodToSlider(defaultPeriod);
  buildEntityChips();
  buildSwimlanes();
  buildTimelineTicks(defaultPeriod.yearMin, defaultPeriod.yearMax);
  buildSnapshotMarkers();
  buildMethodology(primary);
  bindEvents();
  CivRadar.resizeCanvas($('#radar-canvas'));
  render();
}

function getCiv(id) { return state.civilizations.find((c) => c.id === id); }
function getPrimaryCiv() { return getCiv(state.primaryCivId); }
function getSelectedCivs() { return state.selectedCivIds.map((id) => getCiv(id)).filter(Boolean); }

function getDimensionMap(eraTemplate) {
  return CivTemplates.getDimensionMap(eraTemplate);
}

function getProfileAxes(eraTemplate) {
  return CivTemplates.getTemplateAxes(eraTemplate);
}

function applyPeriodToSlider(period) {
  const slider = $('#year-slider');
  const step = CivNav.getYearStep(period.yearMin, period.yearMax);
  slider.min = period.yearMin;
  slider.max = period.yearMax;
  slider.step = step;
  slider.value = state.currentYear;
  $('#period-range').textContent = CivNav.formatPeriodRange(period, formatYear);
}

function buildEraPeriodTabs() {
  const periods = CivNav.periodsWithData(state.civilizations);
  $('#era-period-tabs').innerHTML = periods.map((p) => {
    const tpl = CivNav.getPeriod(p.id) || p;
    const label = tpl.shortLabel || tpl.label;
    return `<button type="button" class="era-tab ${p.id === state.selectedPeriodId ? 'active' : ''}" data-period="${p.id}" role="tab" aria-selected="${p.id === state.selectedPeriodId}">${label}</button>`;
  }).join('');
}

function updateEntityContext() {
  const period = getPeriod();
  const civ = getPrimaryCiv();
  if (!period || !civ) {
    $('#entity-context').textContent = '';
    return;
  }
  $('#entity-context').textContent = `${civ.data.meta.country} · ${period.label}`;
}

function buildEntityChips() {
  const period = getPeriod();
  const el = $('#entity-chips');
  updateEntityContext();

  if (!period) {
    el.innerHTML = '';
    return;
  }

  if (state.viewTab === 'profile') {
    buildProfileEntityChips(period, el);
  } else {
    buildCompareEntityChips(period, el);
  }
}

function buildProfileEntityChips(period, el) {
  const available = CivNav.civilizationsInPeriod(state.civilizations, period);
  const primary = getPrimaryCiv();

  if (!available.length) {
    el.innerHTML = '<p class="muted empty-period">该时段暂无记录，欢迎贡献数据</p>';
    return;
  }

  if (!available.find((c) => c.id === state.primaryCivId)) {
    state.primaryCivId = available[0].id;
    state.selectedCivIds = [state.primaryCivId];
    $('#page-subtitle').textContent = getPrimaryCiv().data.meta.subtitle;
    buildMethodology(getPrimaryCiv());
  }

  const chips = CivNav.getGroupChips(getPrimaryCiv(), period);
  if (!chips.length) {
    el.innerHTML = '<p class="muted empty-period">该时段暂无记录，欢迎贡献数据</p>';
    return;
  }

  if (!state.selectedGroupId || !chips.find((c) => c.id === state.selectedGroupId)) {
    state.selectedGroupId = chips[0].id;
    state.currentYear = CivNav.defaultYearForPeriod(getPrimaryCiv(), period, state.selectedGroupId);
    $('#year-slider').value = state.currentYear;
  }

  const civSwitch = available.length > 1
    ? available.map((entry) => {
      const active = entry.id === state.primaryCivId;
      return `<button type="button" class="entity-chip civ-switch ${active ? 'selected' : ''}" data-civ="${entry.id}"><span class="civ-dot" style="background:${entry.color}"></span>${entry.name}</button>`;
    }).join('')
    : '';

  const groupChips = chips.map((c) =>
    `<button type="button" class="entity-chip ${c.id === state.selectedGroupId ? 'selected' : ''}" data-group="${c.id}">${c.label}</button>`
  ).join('');

  el.innerHTML = `${civSwitch}${groupChips}`;
}

function buildCompareEntityChips(period, el) {
  const available = CivNav.civilizationsInPeriod(state.civilizations, period);

  if (!available.length) {
    el.innerHTML = '<p class="muted empty-period">该时段暂无可对比文明</p>';
    return;
  }

  state.selectedCivIds = state.selectedCivIds.filter((id) => available.some((c) => c.id === id));
  if (!state.selectedCivIds.length) {
    state.selectedCivIds = [available[0].id];
    state.primaryCivId = available[0].id;
  }
  if (!state.selectedCivIds.includes(state.primaryCivId)) {
    state.primaryCivId = state.selectedCivIds[0];
  }

  el.innerHTML = available.map((entry) => {
    const checked = state.selectedCivIds.includes(entry.id);
    const primary = entry.id === state.primaryCivId;
    return `
      <label class="entity-chip civ-chip ${checked ? 'selected' : ''} ${primary ? 'primary' : ''}" data-civ="${entry.id}">
        <input type="checkbox" name="entity-civ" value="${entry.id}" ${checked ? 'checked' : ''}>
        <span class="civ-dot" style="background:${entry.color}"></span>
        <span>${entry.name}</span>
      </label>`;
  }).join('');
}

function onPeriodChange(periodId) {
  if (periodId === state.selectedPeriodId) return;

  state.selectedPeriodId = periodId;
  state.selectedGroupId = null;
  state.expandedCards.clear();
  state.highlightedId = null;

  const period = getPeriod();
  const available = CivNav.civilizationsInPeriod(state.civilizations, period);

  if (state.viewTab === 'compare') {
    state.selectedCivIds = state.selectedCivIds.filter((id) => available.some((c) => c.id === id));
    if (!state.selectedCivIds.length && available.length) {
      state.selectedCivIds = [available[0].id];
    }
  } else if (!available.find((c) => c.id === state.primaryCivId) && available.length) {
    state.primaryCivId = available[0].id;
    state.selectedCivIds = [state.primaryCivId];
    $('#page-subtitle').textContent = getPrimaryCiv().data.meta.subtitle;
    buildMethodology(getPrimaryCiv());
  }

  const primary = getPrimaryCiv();
  state.currentYear = CivNav.defaultYearForPeriod(primary, period, null);
  state.lastEraTemplate = period.eraTemplate;

  applyPeriodToSlider(period);
  buildEraPeriodTabs();
  buildEntityChips();
  buildSwimlanes();
  buildTimelineTicks(period.yearMin, period.yearMax);
  buildSnapshotMarkers();
  render();
}

function onGroupSelect(groupId) {
  if (groupId === state.selectedGroupId) return;
  state.selectedGroupId = groupId;
  state.expandedCards.clear();
  state.highlightedId = null;

  const period = getPeriod();
  const primary = getPrimaryCiv();
  state.currentYear = CivNav.defaultYearForPeriod(primary, period, groupId);
  $('#year-slider').value = state.currentYear;
  buildEntityChips();
  buildSnapshotMarkers();
  buildSwimlanes();
  render();
}

function onProfileCivSwitch(civId) {
  if (civId === state.primaryCivId) return;
  state.primaryCivId = civId;
  state.selectedCivIds = [civId];
  state.selectedGroupId = null;
  state.expandedCards.clear();
  state.highlightedId = null;

  const civ = getPrimaryCiv();
  const period = getPeriod();
  $('#page-subtitle').textContent = civ.data.meta.subtitle;
  buildMethodology(civ);
  state.currentYear = CivNav.defaultYearForPeriod(civ, period, null);
  $('#year-slider').value = state.currentYear;
  buildEntityChips();
  buildSnapshotMarkers();
  buildSwimlanes();
  render();
}

function buildTimelineTicks(min, max) {
  const count = 6;
  const step = (max - min) / (count - 1);
  $('#timeline-ticks').innerHTML = Array.from({ length: count }, (_, i) =>
    `<span>${formatYear(Math.round(min + step * i))}</span>`
  ).join('');
}

function buildSnapshotMarkers() {
  const period = getPeriod();
  const primary = getPrimaryCiv();
  if (!period || !primary) return;

  const snaps = CivNav.snapshotsInPeriod(primary.data.snapshots, period);
  const range = period.yearMax - period.yearMin;
  if (!range) return;

  $('#snapshot-markers').innerHTML = snaps.map((snap) => {
    const pct = ((snap.year - period.yearMin) / range) * 100;
    const tplLabel = CivTemplates.getTemplate(period.eraTemplate).label;
    const groupLabel = snap.group || snap.eraLabel;
    return `<button type="button" class="snap-marker" style="left:${pct}%" title="${formatYear(snap.year)} · ${groupLabel} · ${tplLabel}" data-year="${snap.year}"></button>`;
  }).join('');

  $$('.snap-marker').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentYear = Number(btn.dataset.year);
      $('#year-slider').value = state.currentYear;
      render();
    });
  });
}

function onSwimlaneMarkerClick(civId, year, groupId) {
  const period = getPeriod();
  if (!period) return;

  if (state.viewTab === 'profile') {
    state.primaryCivId = civId;
    state.selectedCivIds = [civId];
    if (groupId) state.selectedGroupId = groupId;
    const civ = getCiv(civId);
    $('#page-subtitle').textContent = civ.data.meta.subtitle;
    buildMethodology(civ);
  } else {
    if (!state.selectedCivIds.includes(civId)) {
      if (state.selectedCivIds.length >= MAX_COMPARE) {
        flashHint(`对比视图最多选择 ${MAX_COMPARE} 个文明`);
        return;
      }
      state.selectedCivIds = [...state.selectedCivIds, civId];
    }
    state.primaryCivId = civId;
  }

  state.currentYear = year;
  state.expandedCards.clear();
  state.highlightedId = null;
  $('#year-slider').value = year;
  buildEntityChips();
  buildSnapshotMarkers();
  buildSwimlanes();
  render();
}

function onSwimlaneRowClick(civId, groupId) {
  const period = getPeriod();
  const civ = getCiv(civId);
  if (!period || !civ) return;

  if (state.viewTab === 'profile') {
    state.primaryCivId = civId;
    state.selectedCivIds = [civId];
    state.selectedGroupId = groupId || null;
    $('#page-subtitle').textContent = civ.data.meta.subtitle;
    buildMethodology(civ);
  } else {
    if (!state.selectedCivIds.includes(civId)) {
      if (state.selectedCivIds.length >= MAX_COMPARE) {
        flashHint(`对比视图最多选择 ${MAX_COMPARE} 个文明`);
        return;
      }
      state.selectedCivIds = [...state.selectedCivIds, civId];
    }
    state.primaryCivId = civId;
  }

  state.currentYear = CivNav.defaultYearForPeriod(civ, period, groupId || null);
  state.expandedCards.clear();
  state.highlightedId = null;
  $('#year-slider').value = state.currentYear;
  buildEntityChips();
  buildSnapshotMarkers();
  buildSwimlanes();
  render();
}

function buildSwimlanes() {
  const period = getPeriod();
  const section = $('#swimlane-section');
  if (!period) {
    section.hidden = true;
    return;
  }

  const rows = CivNav.getSwimlaneRows(state.civilizations, period, {
    viewTab: state.viewTab,
    primaryCivId: state.primaryCivId,
  });

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

function formatYearShort(year) {
  if (year < 0) return `前${Math.abs(year)}`;
  return `${year}`;
}

function renderSwimlaneRow(row, period, range) {
  const isHighlighted = state.viewTab === 'compare'
    ? state.selectedCivIds.includes(row.civId)
    : row.civId === state.primaryCivId;
  const isPrimary = row.civId === state.primaryCivId;
  const dynastyAttr = row.isDynasty ? ' data-dynasty="true"' : '';

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
    const groupAttr = row.groupId || snap.group || snap.dynasty || snap.eraLabel;
    const title = `${label} · ${formatYear(snap.year)}`;
    const active = snap.year === state.currentYear
      && row.civId === state.primaryCivId
      && (!row.groupId || row.groupId === (state.selectedGroupId || label));
    return `<button type="button" class="swimlane-marker ${active ? 'active' : ''}" style="left:${pct}%" data-civ="${row.civId}" data-year="${snap.year}" data-group="${groupAttr}" title="${title}" aria-label="${title}"></button>`;
  }).join('');

  return `
    <div class="swimlane-row ${isHighlighted ? 'highlighted' : ''} ${isPrimary ? 'primary' : ''}" style="--lane-color:${row.color}" data-civ="${row.civId}" data-group="${row.groupId || ''}"${dynastyAttr}>
      <span class="swimlane-label" title="${row.name}">${row.name}</span>
      <div class="swimlane-track">
        ${presenceHtml}
        ${markersHtml}
      </div>
    </div>`;
}

function updateSwimlaneHighlights() {
  const period = getPeriod();
  if (!period || $('#swimlane-section').hidden) return;

  $$('.swimlane-row').forEach((row) => {
    const civId = row.dataset.civ;
    const isHighlighted = state.viewTab === 'compare'
      ? state.selectedCivIds.includes(civId)
      : civId === state.primaryCivId;
    row.classList.toggle('highlighted', isHighlighted);
    row.classList.toggle('primary', civId === state.primaryCivId);
  });

  $$('.swimlane-marker').forEach((m) => {
    const year = Number(m.dataset.year);
    const civId = m.dataset.civ;
    const groupId = m.dataset.group || null;
    let active = year === state.currentYear && civId === state.primaryCivId;
    if (active && groupId && state.selectedGroupId) {
      active = groupId === state.selectedGroupId;
    }
    m.classList.toggle('active', active);
  });
}

function buildMethodology(civ) {
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
}

function bindEvents() {
  $('#era-period-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.era-tab');
    if (!btn) return;
    onPeriodChange(btn.dataset.period);
  });

  $('#entity-chips').addEventListener('click', (e) => {
    const groupBtn = e.target.closest('[data-group]');
    if (groupBtn) {
      onGroupSelect(groupBtn.dataset.group);
      return;
    }
    const civBtn = e.target.closest('.civ-switch');
    if (civBtn) {
      onProfileCivSwitch(civBtn.dataset.civ);
    }
  });

  $('#entity-chips').addEventListener('change', (e) => {
    const target = e.target;
    if (!target.matches('input[name="entity-civ"]')) return;

    const checked = [...document.querySelectorAll('input[name="entity-civ"]:checked')].map((el) => el.value);
    if (checked.length > MAX_COMPARE) {
      target.checked = false;
      flashHint(`对比视图最多选择 ${MAX_COMPARE} 个文明`);
      return;
    }
    if (checked.length === 0) {
      target.checked = true;
      return;
    }

    state.selectedCivIds = checked;
    state.primaryCivId = checked[0];
    state.expandedCards.clear();
    buildEntityChips();
    buildSnapshotMarkers();
    buildSwimlanes();
    render();
  });

  $('#swimlane-lanes').addEventListener('click', (e) => {
    const marker = e.target.closest('.swimlane-marker');
    if (marker) {
      e.stopPropagation();
      onSwimlaneMarkerClick(marker.dataset.civ, Number(marker.dataset.year), marker.dataset.group || null);
      return;
    }
    const row = e.target.closest('.swimlane-row');
    if (row) {
      onSwimlaneRowClick(row.dataset.civ, row.dataset.group || null);
    }
  });

  $('#year-slider').addEventListener('input', (e) => {
    state.currentYear = Number(e.target.value);
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
    state.selectedGroupId = null;

    if (view === 'profile') {
      state.selectedCivIds = [state.primaryCivId];
      state.showAverage = false;
      $('#toggle-average').checked = false;
      $('#profile-toggles').hidden = false;
      $('#compare-toggles').hidden = true;
    } else {
      $('#profile-toggles').hidden = true;
      $('#compare-toggles').hidden = false;
    }

    $$('.view-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    buildEntityChips();
    buildSnapshotMarkers();
    buildSwimlanes();
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
  state.currentYear = Math.max(period.yearMin, Math.min(period.yearMax, state.currentYear + dir * step));
  $('#year-slider').value = state.currentYear;
  render();
}

function formatYear(year) {
  if (year < 0) return `公元前 ${Math.abs(year)} 年`;
  if (year === 0) return '公元元年';
  return `公元 ${year} 年`;
}

function isSnapInRange(snap, year) {
  const period = getPeriod();
  if (!period || !snap) return false;
  if (!CivNav.snapshotInPeriod(snap, period)) return false;
  return Math.abs(snap.year - year) <= getSnapTolerance();
}

function updateTemplateBanner(snap) {
  const banner = $('#template-banner');
  const period = getPeriod();
  const eraTemplate = period?.eraTemplate || snap?.eraTemplate;

  if (!eraTemplate) {
    banner.hidden = true;
    return;
  }

  const tpl = CivTemplates.getTemplate(eraTemplate);
  const legacyNote = snap?._fromLegacy ? ' <span class="legacy-tag">（旧十维映射）</span>' : '';

  if (state.lastEraTemplate && state.lastEraTemplate !== eraTemplate) {
    const prev = CivTemplates.getTemplate(state.lastEraTemplate);
    banner.hidden = false;
    banner.className = 'template-banner template-changed';
    banner.innerHTML = `维度集已切换：<strong>${prev.label}</strong> → <strong>${tpl.label}</strong>。跨时代不宜直接叠图比较剖面雷达。`;
  } else {
    banner.hidden = false;
    banner.className = 'template-banner';
    banner.innerHTML = `时代模板：<strong>${tpl.label}</strong>${legacyNote}`;
  }

  state.lastEraTemplate = eraTemplate;
}

function checkCompareTemplateMismatch() {
  if (state.viewTab !== 'compare' || state.selectedCivIds.length < 2) return '';

  const period = getPeriod();
  const templates = getSelectedCivs().map((civ) => {
    const snap = getResolvedSnap(civ, state.currentYear);
    return snap?.eraTemplate || period?.eraTemplate;
  }).filter(Boolean);

  const unique = [...new Set(templates)];
  if (unique.length > 1) {
    return `<p class="template-warn">⚠ 所选文明时代模板不一致（${unique.map((id) => CivTemplates.getTemplate(id).label).join(' vs ')}），同时代横向比较须使用相同模板。</p>`;
  }
  return '';
}

function renderRejectedItem(item) {
  const conf = getPrimaryCiv().data.confidenceLabels[item.confidence] || item.confidence;
  return `<li><span class="rejected-claim">${item.claim}</span><span class="rejected-refute">反驳：${item.refutedBy}</span><span class="dim-badge badge-${item.confidence}">${conf}</span></li>`;
}

function renderEvidenceTypes(types) {
  const labels = getPrimaryCiv().data.meta.evidenceTypeLabels || {};
  if (!types?.length) return '';
  return `<div class="evidence-types"><strong>史料类型</strong><div class="tag-row">${types.map((t) => `<span class="tag tag-${t}">${labels[t] || t}</span>`).join('')}</div></div>`;
}

function renderSourceItem(src) {
  if (typeof src === 'string') return `<li>${src}</li>`;
  const typeLabel = getPrimaryCiv().data.meta.sourceTypeLabels?.[src.type] || src.type;
  const note = src.note ? ` <span class="source-note">— ${src.note}</span>` : '';
  return `<li><span class="source-type">[${typeLabel}]</span> ${src.ref}${note}</li>`;
}

function render() {
  const period = getPeriod();
  const primary = getPrimaryCiv();
  const raw = period
    ? findNearestSnapshotInPeriod(primary.data.snapshots, state.currentYear, period)
    : null;
  const inRange = isSnapInRange(raw, state.currentYear);
  const snap = inRange ? getResolvedSnap(primary, state.currentYear) : null;

  $('#year-display').textContent = formatYear(state.currentYear);
  $('#era-label').textContent = inRange && raw
    ? (raw.group ? `${raw.group}（${raw.eraLabel}）` : raw.eraLabel)
    : '该时段无快照';

  $('#world-context').textContent = inRange && raw?.worldContext
    ? `世界背景：${raw.worldContext}`
    : raw
      ? `当前选择 ${formatYear(state.currentYear)}，最近快照为 ${formatYear(raw.year)}（${raw.group || raw.eraLabel}），点击时间轴圆点可跳转。`
      : '该时段暂无记录，请选择其他时代段或朝代。';

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
  const avgInfo = CivStats.periodAverageAllStats(
    state.currentYear, state.civilizations, tolerance, findNearestSnapshotForAvg, isSnapInRange, resolveSnapForPeriod
  );
  const wrap = $('#avg-toggle-wrap');
  const checkbox = $('#toggle-average');
  if (!avgInfo) {
    wrap.classList.add('disabled');
    checkbox.disabled = true;
    if (state.showAverage) {
      state.showAverage = false;
      checkbox.checked = false;
    }
  } else {
    wrap.classList.remove('disabled');
    checkbox.disabled = false;
  }
}

function renderSnapshotInfo(snap, raw, inRange) {
  const el = $('#snapshot-info');
  const civ = getPrimaryCiv();
  const period = getPeriod();

  if (!inRange || !snap) {
    el.innerHTML = `<h3>暂无精确快照</h3><p class="muted">请拖动滑块至时间轴圆点附近，或选择其他朝代。</p>${raw ? `<p class="muted">最近记录：<strong>${raw.group || raw.eraLabel}</strong>（${formatYear(raw.year)}）</p>` : ''}`;
    return;
  }

  const tpl = CivTemplates.getTemplate(period.eraTemplate);
  const compareNote = state.viewTab === 'compare' && state.selectedCivIds.length > 1
    ? `<p class="compare-note muted">对比中：${getSelectedCivs().map((c) => c.name).join('、')}</p>` : '';
  const templateMismatch = checkCompareTemplateMismatch();
  const statsBlock = state.viewTab === 'compare' ? renderStatsSummary(snap) : '';
  const dynastyLine = raw.dynasty ? `<p class="dynasty-badge muted">朝代：${raw.dynasty}</p>` : '';

  el.innerHTML = `
    <h3 style="color:${civ.color}">${civ.data.meta.country}</h3>
    <p class="era-badge">${raw.group || raw.eraLabel}</p>
    ${dynastyLine}
    <p class="template-badge">时代模板：${tpl.label}</p>
    ${compareNote}
    ${templateMismatch}
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
    const grade = CivStats.getGrade(v);
    return `<span class="stat-pill">${s.short} ${v ?? '—'} <em>${grade}</em></span>`;
  }).join('');
  return `<div class="stats-summary">${items}</div>`;
}

function renderCards(inRange, snap) {
  const grid = $('#dimension-grid');
  grid.className = 'dimension-grid';
  if (!inRange || !snap) {
    grid.innerHTML = '<p class="no-data">该时段无记录，请跳转至有快照的年代。</p>';
    return;
  }

  if (state.viewTab === 'profile') {
    grid.classList.add('profile-grid');
    const axes = getProfileAxes(snap.eraTemplate);
    grid.innerHTML = axes.map((dim) => renderProfileCard(dim, snap)).join('');
  } else {
    grid.classList.add('compare-grid');
    const multi = state.selectedCivIds.length > 1;
    if (multi) {
      grid.innerHTML = CivStats.STAT_DEFINITIONS.map((stat) => renderStatCompareRow(stat)).join('');
    } else {
      grid.innerHTML = CivStats.STAT_DEFINITIONS.map((stat) => renderStatCard(stat, snap)).join('');
    }
  }

  bindCardEvents(grid);
}

function renderProfileCard(dim, snap) {
  const civ = getPrimaryCiv();
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
  return `
    <div class="dim-card confidence-${conf} ${expanded ? 'expanded' : ''}" data-card-id="${dim.id}"${rubric}>
      <div class="dim-header"><span class="dim-label">${dim.label}</span><span class="dim-badge badge-${conf}">${label}</span></div>
      <div class="dim-level-bar"><span class="dim-level-fill" style="width:${barWidth}%"></span><span class="dim-level-text">${d.level}/5</span></div>
      <p class="dim-summary">${d.summary}</p>${noteHtml}
    </div>`;
}

function renderStatCard(stat, snap) {
  const stats = CivStats.computeAllStats(snap, snap.eraTemplate);
  const value = stats[stat.id];
  const grade = CivStats.getGrade(value);
  const expanded = state.expandedCards.has(stat.id);
  const dimMap = getDimensionMap(snap.eraTemplate);
  const breakdown = CivStats.getStatBreakdown(snap, stat.id, dimMap, snap.eraTemplate);
  const formula = CivStats.formatBreakdown(breakdown);
  const heavy = CivStats.isSpeculativeHeavy(snap, stat.id, snap.eraTemplate);
  const barWidth = value ?? 0;
  const tplLabel = CivTemplates.getTemplate(snap.eraTemplate).label;

  return `
    <div class="stat-card ${expanded ? 'expanded' : ''} ${value == null ? 'stat-na' : ''}" data-card-id="${stat.id}">
      <div class="stat-card-header">
        <span class="stat-name">${stat.label}</span>
        <span class="stat-short">${stat.short}</span>
        <span class="stat-grade grade-${grade}">${grade}</span>
        <span class="stat-value">${value ?? 'N/A'}</span>
      </div>
      <div class="stat-bar"><span class="stat-bar-fill" style="width:${barWidth}%"></span></div>
      ${heavy ? '<span class="stat-warn">?</span>' : ''}
      <p class="stat-formula ${expanded ? '' : 'clamped'}">${formula}</p>
      ${expanded ? `<p class="stat-era-note muted">权重基于 ${tplLabel} 模板</p>` : ''}
    </div>`;
}

function renderStatCompareRow(stat) {
  const expanded = state.expandedCards.has(stat.id);
  const entries = getSelectedCivs().map((civ) => {
    const s = getResolvedSnap(civ, state.currentYear);
    if (!s) {
      return `<div class="compare-entry" style="--civ-color:${civ.color}"><span class="compare-civ">${civ.name}</span><span class="muted">无快照</span></div>`;
    }
    const stats = CivStats.computeAllStats(s, s.eraTemplate);
    const value = stats[stat.id];
    const grade = CivStats.getGrade(value);
    const dimMap = getDimensionMap(s.eraTemplate);
    const formula = CivStats.formatBreakdown(CivStats.getStatBreakdown(s, stat.id, dimMap, s.eraTemplate));
    return `
      <div class="compare-entry" style="--civ-color:${civ.color}">
        <span class="compare-civ">${civ.name} <span class="muted">(${CivTemplates.getTemplate(s.eraTemplate).label})</span></span>
        <span class="compare-meta"><span class="stat-value-inline">${value ?? 'N/A'}</span> <span class="stat-grade grade-${grade}">${grade}</span></span>
        ${expanded ? `<span class="stat-formula">${formula}</span>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="stat-compare-row ${expanded ? 'expanded' : ''} ${state.highlightedId === stat.id ? 'highlighted' : ''}" data-card-id="${stat.id}">
      <h4 class="compare-dim-title">${stat.label} <span class="stat-short">${stat.short}</span></h4>
      <div class="compare-entries">${entries}</div>
    </div>`;
}

function bindCardEvents(grid) {
  grid.querySelectorAll('[data-card-id]').forEach((card) => {
    const id = card.dataset.cardId;
    card.addEventListener('mouseenter', () => { state.highlightedId = id; updateCardHighlights(); drawRadar(); });
    card.addEventListener('mouseleave', () => { state.highlightedId = null; updateCardHighlights(); drawRadar(); });
    card.addEventListener('click', () => {
      if (state.expandedCards.has(id)) state.expandedCards.delete(id);
      else state.expandedCards.add(id);
      card.classList.toggle('expanded');
      if (state.viewTab === 'compare' && state.selectedCivIds.length > 1) {
        renderCards(true, getResolvedSnap(getPrimaryCiv(), state.currentYear));
      }
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

  if (state.viewTab === 'compare' && state.selectedCivIds.length > 1) {
    legend.hidden = false;
    legend.innerHTML = getSelectedCivs().map((civ, i) => {
      const s = getResolvedSnap(civ, state.currentYear);
      const era = s ? s.eraLabel || CivTemplates.getTemplate(s.eraTemplate).label : '无快照';
      return `<span class="legend-item"><span class="civ-dot" style="background:${civ.color}"></span>${civ.name} · ${era}${i === 0 ? '（主）' : ''}</span>`;
    }).join('');
  } else {
    legend.hidden = true;
  }

  if (state.viewTab === 'compare' && state.showAverage) {
    const tolerance = getSnapTolerance();
    const avg = CivStats.periodAverageAllStats(
      state.currentYear, state.civilizations, tolerance, findNearestSnapshotForAvg, isSnapInRange, resolveSnapForPeriod
    );
    if (avg) {
      aux.hidden = false;
      aux.textContent = `同期派生均值（n=${avg.civCount} 文明，非加权）`;
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
  const primary = getPrimaryCiv();
  const period = getPeriod();
  const snap = getResolvedSnap(primary, state.currentYear);

  if (state.viewTab === 'profile') {
    const eraTemplate = period?.eraTemplate || snap?.eraTemplate || CivTemplates.inferTemplate(state.currentYear);
    const axes = getProfileAxes(eraTemplate).map((d) => ({ id: d.id, short: d.short }));
    const layout = CivRadar.buildLayout(canvas, axes, 5);
    state.radarLayout = layout;

    CivRadar.drawProfileRadar(ctx, layout, {
      snapshot: snap,
      color: primary.color,
      showSpeculative: state.showSpeculative,
      showAverage: false,
      highlightedId: state.highlightedId,
    });
  } else {
    const axes = CivStats.STAT_DEFINITIONS.map((s) => ({ id: s.id, short: s.short }));
    const layout = CivRadar.buildLayout(canvas, axes, 100);
    state.radarLayout = layout;

    const civs = getSelectedCivs();
    const statsList = [];
    const colors = [];

    civs.forEach((civ) => {
      const s = getResolvedSnap(civ, state.currentYear);
      if (s) {
        statsList.push(CivStats.computeAllStats(s, s.eraTemplate));
        colors.push(civ.color);
      }
    });

    let avgStats = null;
    if (state.showAverage) {
      const tolerance = getSnapTolerance();
      const avg = CivStats.periodAverageAllStats(
        state.currentYear, state.civilizations, tolerance, findNearestSnapshotForAvg, isSnapInRange, resolveSnapForPeriod
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
  const layout = state.radarLayout;
  if (!layout) return;

  const newId = CivRadar.hitTest(layout, x, y);
  if (newId !== state.highlightedId) {
    state.highlightedId = newId;
    updateCardHighlights();
    drawRadar();
  }
}

init().catch(console.error);
