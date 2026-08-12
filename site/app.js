const SNAP_TOLERANCE = 350;
const MAX_COMPARE = 3;

const state = {
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

function getResolvedSnap(civ, year) {
  const raw = findNearestSnapshot(civ.data.snapshots, year);
  if (!isSnapInRange(raw, year)) return null;
  return resolveSnap(raw);
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

  const primary = getCiv(state.primaryCivId);
  const { yearMin, yearMax, yearStep } = primary.data.meta;
  const slider = $('#year-slider');
  slider.min = yearMin;
  slider.max = yearMax;
  slider.step = yearStep;
  state.currentYear = primary.data.snapshots[Math.floor(primary.data.snapshots.length / 2)].year;
  slider.value = state.currentYear;

  const initSnap = getResolvedSnap(primary, state.currentYear);
  state.lastEraTemplate = initSnap?.eraTemplate || CivTemplates.inferTemplate(state.currentYear);

  $('#page-subtitle').textContent = primary.data.meta.subtitle;
  buildCivSelector();
  buildTimelineTicks(yearMin, yearMax);
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

function buildCivSelector() {
  const multi = state.viewTab === 'compare';
  $('#civ-selector').innerHTML = state.civIndex.map((entry) => {
    const checked = state.selectedCivIds.includes(entry.id);
    return `
      <label class="civ-chip ${checked ? 'selected' : ''}" data-civ="${entry.id}">
        <input type="${multi ? 'checkbox' : 'radio'}" name="civ-select" value="${entry.id}" ${checked ? 'checked' : ''}>
        <span class="civ-dot" style="background:${entry.color}"></span>
        <span>${entry.name}</span>
      </label>`;
  }).join('');
}

function buildTimelineTicks(min, max) {
  const count = 6;
  const step = (max - min) / (count - 1);
  $('#timeline-ticks').innerHTML = Array.from({ length: count }, (_, i) =>
    `<span>${formatYear(Math.round(min + step * i))}</span>`
  ).join('');
}

function buildSnapshotMarkers() {
  const primary = getPrimaryCiv();
  const { yearMin, yearMax } = primary.data.meta;
  const range = yearMax - yearMin;
  $('#snapshot-markers').innerHTML = primary.data.snapshots.map((snap) => {
    const pct = ((snap.year - yearMin) / range) * 100;
    const tpl = snap.eraTemplate || CivTemplates.inferTemplate(snap.year);
    const tplLabel = CivTemplates.getTemplate(tpl).label;
    return `<button class="snap-marker" style="left:${pct}%" title="${formatYear(snap.year)} · ${snap.eraLabel} · ${tplLabel}" data-year="${snap.year}"></button>`;
  }).join('');
  $$('.snap-marker').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.currentYear = Number(btn.dataset.year);
      $('#year-slider').value = state.currentYear;
      render();
    });
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
  $('#year-slider').addEventListener('input', (e) => { state.currentYear = Number(e.target.value); render(); });
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
    buildCivSelector();
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

  $('#civ-selector').addEventListener('change', (e) => {
    const target = e.target;
    if (!target.matches('input[name="civ-select"]')) return;

    if (state.viewTab === 'compare') {
      const checked = [...document.querySelectorAll('input[name="civ-select"]:checked')].map((el) => el.value);
      if (checked.length > MAX_COMPARE) {
        target.checked = false;
        flashHint(`对比视图最多选择 ${MAX_COMPARE} 个文明`);
        return;
      }
      if (checked.length === 0) { target.checked = true; return; }
      state.selectedCivIds = checked;
      state.primaryCivId = checked[0];
    } else {
      state.primaryCivId = target.value;
      state.selectedCivIds = [target.value];
      const civ = getPrimaryCiv();
      $('#page-subtitle').textContent = civ.data.meta.subtitle;
      buildMethodology(civ);
      buildSnapshotMarkers();
    }
    buildCivSelector();
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
  const { yearStep, yearMin, yearMax } = getPrimaryCiv().data.meta;
  state.currentYear = Math.max(yearMin, Math.min(yearMax, state.currentYear + dir * yearStep));
  $('#year-slider').value = state.currentYear;
  render();
}

function formatYear(year) {
  if (year < 0) return `公元前 ${Math.abs(year)} 年`;
  if (year === 0) return '公元元年';
  return `公元 ${year} 年`;
}

function findNearestSnapshot(snapshots, year) {
  return snapshots.reduce((best, snap) =>
    Math.abs(snap.year - year) < Math.abs(best.year - year) ? snap : best
  );
}

function isSnapInRange(snap, year) {
  return snap && Math.abs(snap.year - year) <= SNAP_TOLERANCE;
}

function updateTemplateBanner(snap) {
  const banner = $('#template-banner');
  if (!snap) {
    banner.hidden = true;
    return;
  }

  const tpl = CivTemplates.getTemplate(snap.eraTemplate);
  const legacyNote = snap._fromLegacy ? ' <span class="legacy-tag">（旧十维映射）</span>' : '';

  if (state.lastEraTemplate && state.lastEraTemplate !== snap.eraTemplate) {
    const prev = CivTemplates.getTemplate(state.lastEraTemplate);
    banner.hidden = false;
    banner.className = 'template-banner template-changed';
    banner.innerHTML = `维度集已切换：<strong>${prev.label}</strong> → <strong>${tpl.label}</strong>。跨时代不宜直接叠图比较剖面雷达。`;
  } else {
    banner.hidden = false;
    banner.className = 'template-banner';
    banner.innerHTML = `时代模板：<strong>${tpl.label}</strong>${legacyNote}`;
  }

  state.lastEraTemplate = snap.eraTemplate;
}

function checkCompareTemplateMismatch() {
  if (state.viewTab !== 'compare' || state.selectedCivIds.length < 2) return '';

  const templates = getSelectedCivs().map((civ) => {
    const snap = getResolvedSnap(civ, state.currentYear);
    return snap?.eraTemplate;
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
  const primary = getPrimaryCiv();
  const raw = findNearestSnapshot(primary.data.snapshots, state.currentYear);
  const inRange = isSnapInRange(raw, state.currentYear);
  const snap = inRange ? resolveSnap(raw) : null;

  $('#year-display').textContent = formatYear(state.currentYear);
  $('#era-label').textContent = inRange ? raw.eraLabel : '该时段无快照';
  $('#world-context').textContent = inRange && raw.worldContext
    ? `世界背景：${raw.worldContext}`
    : `当前选择 ${formatYear(state.currentYear)}，最近快照为 ${formatYear(raw.year)}（${raw.eraLabel}），点击时间轴圆点可跳转。`;

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
  renderAuxLabels();
}

function updateAverageToggle() {
  if (state.viewTab !== 'compare') return;
  const avgInfo = CivStats.periodAverageAllStats(
    state.currentYear, state.civilizations, SNAP_TOLERANCE, findNearestSnapshot, isSnapInRange, resolveSnap
  );
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
  const civ = getPrimaryCiv();
  if (!inRange || !snap) {
    el.innerHTML = `<h3>暂无精确快照</h3><p class="muted">请拖动滑块至时间轴圆点附近。</p><p class="muted">最近记录：<strong>${raw.eraLabel}</strong>（${formatYear(raw.year)}）</p>`;
    return;
  }

  const tpl = CivTemplates.getTemplate(snap.eraTemplate);
  const compareNote = state.viewTab === 'compare' && state.selectedCivIds.length > 1
    ? `<p class="compare-note muted">对比中：${getSelectedCivs().map((c) => c.name).join('、')}</p>` : '';
  const templateMismatch = checkCompareTemplateMismatch();
  const statsBlock = state.viewTab === 'compare' ? renderStatsSummary(snap) : '';

  el.innerHTML = `
    <h3 style="color:${civ.color}">${civ.data.meta.country}</h3>
    <p class="era-badge">${raw.eraLabel}</p>
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
    const snap = getResolvedSnap(civ, state.currentYear);
    if (!snap) {
      return `<div class="compare-entry" style="--civ-color:${civ.color}"><span class="compare-civ">${civ.name}</span><span class="muted">无快照</span></div>`;
    }
    const stats = CivStats.computeAllStats(snap, snap.eraTemplate);
    const value = stats[stat.id];
    const grade = CivStats.getGrade(value);
    const dimMap = getDimensionMap(snap.eraTemplate);
    const formula = CivStats.formatBreakdown(CivStats.getStatBreakdown(snap, stat.id, dimMap, snap.eraTemplate));
    return `
      <div class="compare-entry" style="--civ-color:${civ.color}">
        <span class="compare-civ">${civ.name} <span class="muted">(${CivTemplates.getTemplate(snap.eraTemplate).label})</span></span>
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
      const snap = getResolvedSnap(civ, state.currentYear);
      const era = snap ? snap.eraLabel || CivTemplates.getTemplate(snap.eraTemplate).label : '无快照';
      return `<span class="legend-item"><span class="civ-dot" style="background:${civ.color}"></span>${civ.name} · ${era}${i === 0 ? '（主）' : ''}</span>`;
    }).join('');
  } else {
    legend.hidden = true;
  }

  if (state.viewTab === 'compare' && state.showAverage) {
    const avg = CivStats.periodAverageAllStats(state.currentYear, state.civilizations, SNAP_TOLERANCE, findNearestSnapshot, isSnapInRange, resolveSnap);
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
  const snap = getResolvedSnap(primary, state.currentYear);

  if (state.viewTab === 'profile') {
    const eraTemplate = snap?.eraTemplate || CivTemplates.inferTemplate(state.currentYear);
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
      const avg = CivStats.periodAverageAllStats(state.currentYear, state.civilizations, SNAP_TOLERANCE, findNearestSnapshot, isSnapInRange, resolveSnap);
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
  $$('.snap-marker').forEach((m) => m.classList.toggle('active', Number(m.dataset.year) === snap.year));
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
