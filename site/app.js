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
  viewTab: 'detail',
  expandedSources: new Set(),
  expandedAspects: new Set(),
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
  if (!period || !civ) return { raw: null, snap: null, inRange: false };
  return CivEvidence.getResolvedSnap(
    civ,
    year,
    period,
    (snaps, y, p) => findNearestSnapshotInPeriod(snaps, y, p),
    (snap, y) => isSnapInRange(snap, y)
  );
}

async function init() {
  await CivEvidence.loadCatalog();

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
}

function resetDownstreamFromPeriod() {
  state.expandedSources.clear();
  state.expandedAspects.clear();
  initDownstreamFromPeriod();
}

function resetAllDownstream() {
  state.expandedSources.clear();
  state.expandedAspects.clear();
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
    const label = snap.spatialScope || snap.group || snap.eraLabel;
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
    const label = snap.spatialScope || snap.group || snap.eraLabel;
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
        flashHint(`对照最多同时选择 ${MAX_COMPARE} 国`);
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
  state.expandedSources.clear();
  state.expandedAspects.clear();
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
  state.expandedSources.clear();
  state.expandedAspects.clear();
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
  $('#confidence-dl').innerHTML = Object.entries(methodology.confidenceLevels || {})
    .map(([k, v]) => `<dt>${CivEvidence.CONFIDENCE_LABELS[k] || k}</dt><dd>${v}</dd>`).join('');
  $('#page-subtitle').textContent = civ.data.meta.subtitle || '';

  const hypotheses = CivEvidence.collectHypotheses(civ.data);
  const card = $('#hypothesis-card');
  if (hypotheses.length) {
    card.hidden = false;
    $('#hypothesis-list').innerHTML = hypotheses.map((h) => {
      const status = h.status === 'rejected' ? '已反驳' : '待检验';
      const refute = h.refutedBy ? `<span class="hyp-refute">反驳：${h.refutedBy}</span>` : '';
      return `<li class="hyp-${h.status || 'pending'}"><span class="hyp-claim">${h.claim}</span>${refute}<span class="hyp-status">${status}</span></li>`;
    }).join('');
  } else {
    card.hidden = true;
  }
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
    state.comparisonActive = state.swimlaneMembers.slice(0, MAX_COMPARE);
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
    $$('.view-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    render();
  });

  $('#evidence-main').addEventListener('click', (e) => {
    const srcBtn = e.target.closest('[data-source-id]');
    if (srcBtn) {
      const id = srcBtn.dataset.sourceId;
      state.expandedSources.has(id) ? state.expandedSources.delete(id) : state.expandedSources.add(id);
      render();
      return;
    }
    const aspBtn = e.target.closest('[data-aspect-id]');
    if (aspBtn) {
      const id = aspBtn.dataset.aspectId;
      state.expandedAspects.has(id) ? state.expandedAspects.delete(id) : state.expandedAspects.add(id);
      render();
    }
  });
}

function flashHint(msg) {
  let el = $('.mode-hint') || Object.assign(document.createElement('p'), { className: 'mode-hint' });
  if (!el.parentElement) $('#comparison-panel').appendChild(el);
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

function renderSourceTypeLabel(type) {
  return CivEvidence.SOURCE_TYPE_LABELS[type] || type;
}

function renderSourceItem(src, sourceMap) {
  const expanded = state.expandedSources.has(src.id);
  const typeLabel = renderSourceTypeLabel(src.type);
  const locator = src.locator ? `<p class="source-locator">${src.locator}</p>` : '';
  const url = src.url ? `<p class="source-url"><a href="${src.url}" target="_blank" rel="noopener">${src.url}</a></p>` : '';
  const grade = src.grade ? `<span class="source-grade">[${src.grade}]</span>` : '';
  const note = src.note ? `<p class="source-note">${src.note}</p>` : '';
  return `
    <li class="source-item ${expanded ? 'expanded' : ''}">
      <button type="button" class="source-toggle" data-source-id="${src.id}">
        <span class="source-type">[${typeLabel}]</span>
        <span class="source-ref">${grade} ${src.ref}</span>
        <span class="expand-icon">${expanded ? '▾' : '▸'}</span>
      </button>
      ${expanded ? `<div class="source-detail">${note}${locator}${url}</div>` : ''}
    </li>`;
}

function renderAspectCard(asp, sourceMap) {
  const conf = asp.confidence || 'absent';
  const label = CivEvidence.CONFIDENCE_LABELS[conf] || conf;
  const expanded = state.expandedAspects.has(asp.id);
  const refs = (asp.sourceRefs || [])
    .map((id) => sourceMap[id])
    .filter(Boolean)
    .map((s) => `<span class="source-ref-link" data-source-id="${s.id}">${s.ref}</span>`)
    .join('、');

  if (conf === 'absent') {
    return `
      <div class="aspect-card confidence-absent" data-aspect-id="${asp.id}">
        <div class="aspect-header">
          <span class="aspect-label">${asp.label}</span>
          <span class="aspect-badge badge-absent">${label}</span>
        </div>
        <p class="aspect-summary">${asp.note || '已检索，无证据'}</p>
      </div>`;
  }

  return `
    <div class="aspect-card confidence-${conf} ${expanded ? 'expanded' : ''}" data-aspect-id="${asp.id}">
      <button type="button" class="aspect-toggle" data-aspect-id="${asp.id}">
        <div class="aspect-header">
          <span class="aspect-label">${asp.label}</span>
          <span class="aspect-badge badge-${conf}">${label}</span>
        </div>
        <p class="aspect-summary">${asp.summary || '—'}</p>
      </button>
      ${expanded ? `
        <div class="aspect-detail">
          ${asp.note ? `<p class="aspect-note">${asp.note}</p>` : ''}
          ${refs ? `<p class="aspect-sources">来源：${refs}</p>` : '<p class="aspect-sources muted">无关联来源</p>'}
        </div>` : ''}
    </div>`;
}

function renderDetailView() {
  const civ = getFocusCiv();
  if (!civ) {
    return '<p class="no-data">请勾选国家加入泳道。</p>';
  }

  const { raw, snap, inRange } = getResolvedSnap(civ, state.focusYear);
  if (!inRange || !snap) {
    const hint = raw
      ? `最近快照：${formatYear(raw.year)}（${raw.spatialScope || raw.eraLabel}）`
      : '该时段无记录';
    return `<p class="no-data">该时段无精确快照，请拖动滑块至圆点附近。</p><p class="muted">${hint}</p>`;
  }

  const buckets = CivEvidence.getAspectEntries(snap);
  const sourceMap = snap._sourceMap || {};

  const sourcesHtml = snap.sources?.length
    ? `<section class="evidence-section">
        <h2 class="panel-title">来源列表 <span class="count-badge">${snap.sources.length}</span></h2>
        <ul class="source-list">${snap.sources.map((s) => renderSourceItem(s, sourceMap)).join('')}</ul>
      </section>`
    : '<section class="evidence-section"><p class="muted">本快照尚无 sources[] 记录</p></section>';

  const aspectsHtml = [...buckets.documented, ...buckets.inferred].length
    ? `<section class="evidence-section">
        <h2 class="panel-title">断言卡片</h2>
        <div class="aspect-grid">${[...buckets.documented, ...buckets.inferred].map((a) => renderAspectCard(a, sourceMap)).join('')}</div>
      </section>`
    : '';

  const absentHtml = buckets.absent.length
    ? `<section class="evidence-section absent-section">
        <h2 class="panel-title">显式 absent <span class="count-badge">${buckets.absent.length}</span></h2>
        <p class="section-hint muted">已检索，当前证据不足以做判断</p>
        <div class="aspect-grid">${buckets.absent.map((a) => renderAspectCard(a, sourceMap)).join('')}</div>
      </section>`
    : '';

  return `${sourcesHtml}${aspectsHtml}${absentHtml}`;
}

function renderCompareView() {
  const compareCivs = getComparisonCivs();
  if (!compareCivs.length) {
    return '<p class="no-data">请至少选择一国参与比较。</p>';
  }

  const civSnaps = compareCivs.map((civ) => {
    const { snap, inRange } = getResolvedSnap(civ, state.focusYear);
    return { civ, snap, inRange };
  });

  const rows = CivEvidence.compareAspects(civSnaps);
  if (!rows.length) {
    return '<p class="no-data">所选国家在该年代均无 aspect 记录可对齐。</p>';
  }

  return `
    <section class="evidence-section">
      <h2 class="panel-title">同时代对照 <span class="muted">${formatYear(state.focusYear)}</span></h2>
      <p class="section-hint muted">同一 aspect 各国并排文字，不含雷达与综合分</p>
      <div class="compare-table">
        ${rows.map((row) => `
          <div class="compare-row">
            <h3 class="compare-aspect-title">${row.label}</h3>
            <div class="compare-cols">
              ${row.entries.map((entry) => {
                const conf = entry.confidence
                  ? `<span class="aspect-badge badge-${entry.confidence}">${CivEvidence.CONFIDENCE_LABELS[entry.confidence] || entry.confidence}</span>`
                  : '';
                return `
                  <div class="compare-col" style="--civ-color:${entry.civ.color}">
                    <div class="compare-col-header">
                      <span class="civ-dot" style="background:${entry.civ.color}"></span>
                      <span>${entry.civ.name}</span>
                      ${conf}
                    </div>
                    <p class="compare-text">${entry.text}</p>
                    ${entry.note ? `<p class="compare-note muted">${entry.note}</p>` : ''}
                  </div>`;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </section>`;
}

function renderSnapshotInfo() {
  const el = $('#snapshot-info');
  const civ = getFocusCiv();
  const period = getPeriod();

  if (!civ) {
    el.innerHTML = '<h3>未选择国家</h3><p class="muted">请勾选国家加入泳道。</p>';
    return;
  }

  const { raw, snap, inRange } = getResolvedSnap(civ, state.focusYear);

  if (!inRange || !snap) {
    el.innerHTML = `<h3>暂无精确快照</h3><p class="muted">请拖动滑块至圆点附近。</p>${raw ? `<p class="muted">最近：<strong>${raw.spatialScope || raw.eraLabel}</strong>（${formatYear(raw.year)}）</p>` : ''}`;
    return;
  }

  const compareNote = state.viewTab === 'compare' && state.comparisonActive.length > 1
    ? `<p class="compare-note muted">比较参与：${getComparisonCivs().map((c) => c.name).join('、')}</p>` : '';

  const controversies = raw.controversies?.length
    ? `<div class="controversies"><strong>争议点</strong><ul>${raw.controversies.map((c) => `<li>${c}</li>`).join('')}</ul></div>`
    : '';

  el.innerHTML = `
    <h3 style="color:${civ.color}">${civ.data.meta.country || civ.name}</h3>
    <p class="era-badge">${raw.eraLabel}</p>
    <p class="spatial-scope"><strong>空间范围：</strong>${snap.spatialScope}</p>
    ${compareNote}
    <p class="evidence-note"><strong>证据说明：</strong>${raw.evidenceNote || '—'}</p>
    ${controversies}
    <p class="snap-diff muted">快照 ${formatYear(raw.year)}</p>`;
}

function render() {
  const focus = getFocusCiv();
  const { raw, inRange } = focus ? getResolvedSnap(focus, state.focusYear) : { raw: null, inRange: false };

  $('#year-display').textContent = focus ? formatYear(state.focusYear) : '—';
  $('#era-label').textContent = inRange && raw
    ? raw.eraLabel
    : focus ? '该时段无快照' : '请选择国家';

  $('#world-context').textContent = !focus
    ? '请勾选国家加入泳道，或切换区域/时段。'
    : inRange && raw?.worldContext
      ? `世界背景：${raw.worldContext}`
      : raw
        ? `最近快照：${formatYear(raw.year)}（${raw.spatialScope || raw.eraLabel}）`
        : '该时段无记录。';

  $('#evidence-main').innerHTML = state.viewTab === 'detail'
    ? renderDetailView()
    : renderCompareView();

  renderSnapshotInfo();
  updateMarkerHighlight(raw);
  updateSwimlaneHighlights();
}

function updateMarkerHighlight(snap) {
  $$('.snap-marker').forEach((m) => {
    m.classList.toggle('active', snap && Number(m.dataset.year) === snap.year);
  });
}

init().catch(console.error);
