const SNAP_TOLERANCE = 350;
const MAX_COMPARE = 3;
const CONFIDENCE_COLORS = {
  documented: '#4ade80',
  inferred: '#60a5fa',
  speculative: '#fbbf24',
  absent: '#4b5563',
};
const COMPARE_DASH = [6, 4];

const state = {
  currentYear: -500,
  civilizations: [],
  civIndex: [],
  primaryCivId: 'china',
  compareMode: false,
  selectedCivIds: ['china'],
  showAverage: false,
  highlightedDimId: null,
  expandedCards: new Set(),
  radarLayout: null,
};

const $ = (sel) => document.querySelector(sel);

async function init() {
  const indexRes = await fetch('data/civilizations.json');
  const index = await indexRes.json();
  state.civIndex = index.civilizations;

  state.civilizations = await Promise.all(
    state.civIndex.map(async (entry) => {
      const res = await fetch(`data/${entry.file}`);
      const json = await res.json();
      return { ...entry, data: json };
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

  $('#page-subtitle').textContent = primary.data.meta.subtitle;
  buildCivSelector();
  buildTimelineTicks(yearMin, yearMax);
  buildSnapshotMarkers();
  buildMethodology(primary);
  bindEvents();
  resizeRadarCanvas();
  render();
}

function getCiv(id) {
  return state.civilizations.find((c) => c.id === id);
}

function getPrimaryCiv() {
  return getCiv(state.primaryCivId);
}

function getSelectedCivs() {
  return state.selectedCivIds.map((id) => getCiv(id)).filter(Boolean);
}

function buildCivSelector() {
  const container = $('#civ-selector');
  container.innerHTML = state.civIndex.map((entry) => {
    const checked = state.selectedCivIds.includes(entry.id);
    const isPrimary = entry.id === state.primaryCivId;
    return `
      <label class="civ-chip ${checked ? 'selected' : ''} ${isPrimary ? 'primary' : ''}" data-civ="${entry.id}">
        <input type="${state.compareMode ? 'checkbox' : 'radio'}" name="civ-select"
          value="${entry.id}" ${checked ? 'checked' : ''}
          ${state.compareMode ? '' : (isPrimary ? 'checked' : '')}>
        <span class="civ-dot" style="background:${entry.color}"></span>
        <span>${entry.name}</span>
      </label>`;
  }).join('');
}

function buildTimelineTicks(min, max) {
  const ticks = $('#timeline-ticks');
  const count = 6;
  const step = (max - min) / (count - 1);
  ticks.innerHTML = Array.from({ length: count }, (_, i) => {
    const y = Math.round(min + step * i);
    return `<span>${formatYear(y)}</span>`;
  }).join('');
}

function buildSnapshotMarkers() {
  const primary = getPrimaryCiv();
  const { yearMin, yearMax } = primary.data.meta;
  const range = yearMax - yearMin;
  const container = $('#snapshot-markers');

  container.innerHTML = primary.data.snapshots.map((snap) => {
    const pct = ((snap.year - yearMin) / range) * 100;
    return `<button class="snap-marker" style="left:${pct}%"
      title="${formatYear(snap.year)} · ${snap.eraLabel}"
      data-year="${snap.year}"></button>`;
  }).join('');

  container.querySelectorAll('.snap-marker').forEach((btn) => {
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

  const { principles, confidenceLevels } = methodology;
  $('#methodology-list').innerHTML = principles.map((p) => `<li>${p}</li>`).join('');
  $('#confidence-dl').innerHTML = Object.entries(confidenceLevels)
    .map(([k, v]) => `<dt>${civ.data.confidenceLabels[k]}</dt><dd>${v}</dd>`)
    .join('');

  const rejected = civ.data.meta.rejectedHypotheses || getCiv('china')?.data.meta.rejectedHypotheses;
  const existing = $('.rejected-card');
  if (existing) existing.remove();
  if (rejected?.length) {
    const card = document.createElement('div');
    card.className = 'info-card rejected-card';
    card.innerHTML = `
      <h3>已反驳假说（国家级）</h3>
      <ul class="rejected-list">${rejected.map(renderRejectedItem).join('')}</ul>`;
    $('.sidebar').appendChild(card);
  }
}

function bindEvents() {
  $('#year-slider').addEventListener('input', (e) => {
    state.currentYear = Number(e.target.value);
    render();
  });
  $('#btn-prev').addEventListener('click', () => stepYear(-1));
  $('#btn-next').addEventListener('click', () => stepYear(1));

  $('#toggle-average').addEventListener('change', (e) => {
    state.showAverage = e.target.checked;
    if (state.showAverage && state.compareMode) {
      state.compareMode = false;
      state.selectedCivIds = [state.primaryCivId];
      $('#toggle-compare').checked = false;
      buildCivSelector();
    }
    render();
  });

  $('#toggle-compare').addEventListener('change', (e) => {
    state.compareMode = e.target.checked;
    if (state.compareMode) {
      state.showAverage = false;
      $('#toggle-average').checked = false;
      if (state.selectedCivIds.length < 2) {
        state.selectedCivIds = [state.primaryCivId];
      }
    } else {
      state.selectedCivIds = [state.primaryCivId];
    }
    buildCivSelector();
    render();
  });

  $('#civ-selector').addEventListener('change', (e) => {
    const target = e.target;
    if (!target.matches('input[name="civ-select"]')) return;

    if (state.compareMode) {
      const checked = Array.from(
        document.querySelectorAll('input[name="civ-select"]:checked')
      ).map((el) => el.value);

      if (checked.length > MAX_COMPARE) {
        target.checked = false;
        flashHint(`对比模式最多选择 ${MAX_COMPARE} 个文明`);
        return;
      }
      if (checked.length === 0) {
        target.checked = true;
        return;
      }
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
    state.highlightedDimId = null;
    updateCardHighlights();
    drawRadar();
  });

  window.addEventListener('resize', () => {
    resizeRadarCanvas();
    render();
  });
}

function flashHint(msg) {
  let el = $('.mode-hint');
  if (!el) {
    el = document.createElement('p');
    el.className = 'mode-hint';
    $('#viz-controls').appendChild(el);
  }
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

function getDimLevel(dim) {
  if (!dim || dim.confidence === 'absent' || dim.level == null) return 0;
  return dim.level;
}

function renderRejectedItem(item) {
  const civ = getPrimaryCiv();
  const conf = civ.data.confidenceLabels[item.confidence] || item.confidence;
  return `<li><span class="rejected-claim">${item.claim}</span>
    <span class="rejected-refute">反驳：${item.refutedBy}</span>
    <span class="dim-badge badge-${item.confidence}">${conf}</span></li>`;
}

function renderEvidenceTypes(types) {
  const civ = getPrimaryCiv();
  const labels = civ.data.meta.evidenceTypeLabels || {};
  if (!types?.length) return '';
  return `
    <div class="evidence-types">
      <strong>史料类型</strong>
      <div class="tag-row">
        ${types.map((t) => `<span class="tag tag-${t}">${labels[t] || t}</span>`).join('')}
      </div>
    </div>`;
}

function renderSourceItem(src) {
  const civ = getPrimaryCiv();
  if (typeof src === 'string') return `<li>${src}</li>`;
  const typeLabel = civ.data.meta.sourceTypeLabels?.[src.type] || src.type;
  const note = src.note ? ` <span class="source-note">— ${src.note}</span>` : '';
  return `<li><span class="source-type">[${typeLabel}]</span> ${src.ref}${note}</li>`;
}

function renderListSection(title, items, className = '') {
  if (!items?.length) return '';
  return `
    <div class="info-section ${className}">
      <strong>${title}</strong>
      <ul>${items.map((item) => typeof item === 'string' ? `<li>${item}</li>` : renderRejectedItem(item)).join('')}</ul>
    </div>`;
}

function render() {
  const primary = getPrimaryCiv();
  const snap = findNearestSnapshot(primary.data.snapshots, state.currentYear);
  const inRange = isSnapInRange(snap, state.currentYear);

  $('#year-display').textContent = formatYear(state.currentYear);
  $('#era-label').textContent = inRange ? snap.eraLabel : '该时段无快照';
  $('#world-context').textContent = inRange && snap.worldContext
    ? `世界背景：${snap.worldContext}`
    : `当前选择 ${formatYear(state.currentYear)}，最近快照为 ${formatYear(snap.year)}（${snap.eraLabel}），点击时间轴圆点可跳转。`;

  updateAverageToggle();
  renderSnapshotInfo(snap, inRange);
  renderDimensionGrid(inRange);
  drawRadar();
  updateMarkerHighlight(snap);
  renderCompareLegend();
}

function updateAverageToggle() {
  const avgInfo = calcAverageInfo(state.currentYear);
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

function calcAverageInfo(year) {
  const civCount = state.civilizations.filter((civ) => {
    const snap = findNearestSnapshot(civ.data.snapshots, year);
    return isSnapInRange(snap, year);
  }).length;

  if (civCount < 2) return null;

  const primary = getPrimaryCiv();
  const levelsByDim = {};

  primary.data.dimensions.forEach((dim) => {
    const levels = [];
    state.civilizations.forEach((civ) => {
      const snap = findNearestSnapshot(civ.data.snapshots, year);
      if (!isSnapInRange(snap, year)) return;
      const d = snap.dimensions[dim.id];
      const level = getDimLevel(d);
      if (level > 0) levels.push(level);
    });
    levelsByDim[dim.id] = levels.length >= 2
      ? levels.reduce((a, b) => a + b, 0) / levels.length
      : null;
  });

  return { civCount, levelsByDim };
}

function updateMarkerHighlight(snap) {
  document.querySelectorAll('.snap-marker').forEach((m) => {
    m.classList.toggle('active', Number(m.dataset.year) === snap.year);
  });
}

function renderSnapshotInfo(snap, inRange) {
  const el = $('#snapshot-info');
  const civ = getPrimaryCiv();

  if (!inRange) {
    el.innerHTML = `
      <h3>暂无精确快照</h3>
      <p class="muted">请拖动滑块至时间轴圆点（●）附近，或点击圆点跳转至有记录的朝代。</p>
      <p class="muted">最近记录：<strong>${snap.eraLabel}</strong>（${formatYear(snap.year)}）</p>`;
    return;
  }

  const evidenceTypes = renderEvidenceTypes(snap.evidenceTypes);
  const sources = snap.sources?.length
    ? `<div class="sources"><strong>参考来源</strong><ul>${snap.sources.map(renderSourceItem).join('')}</ul></div>`
    : '';
  const controversies = renderListSection('学术争议', snap.controversies, 'controversies');
  const rejected = snap.rejectedHypotheses?.length
    ? `<div class="info-section rejected-snap"><strong>已反驳假说</strong><ul class="rejected-list">${snap.rejectedHypotheses.map(renderRejectedItem).join('')}</ul></div>`
    : '';

  const compareNote = state.compareMode && state.selectedCivIds.length > 1
    ? `<p class="compare-note muted">对比中：${getSelectedCivs().map((c) => c.name).join('、')}</p>`
    : '';

  el.innerHTML = `
    <h3 style="color:${civ.color}">${civ.data.meta.country}</h3>
    <p class="era-badge">${snap.eraLabel}</p>
    ${compareNote}
    ${evidenceTypes}
    <p class="evidence-note"><strong>证据说明：</strong>${snap.evidenceNote}</p>
    ${sources}
    ${controversies}
    ${rejected}
    <p class="snap-diff muted">快照年份 ${formatYear(snap.year)}，与滑块位置相差 ${Math.abs(snap.year - state.currentYear)} 年</p>`;
}

function renderDimensionGrid(inRange) {
  const grid = $('#dimension-grid');
  grid.classList.toggle('compare-layout', state.compareMode && state.selectedCivIds.length > 1);

  if (!inRange) {
    grid.innerHTML = '<p class="no-data">该时段无维度记录，请跳转至有快照的年代。</p>';
    return;
  }

  const primary = getPrimaryCiv();
  const dimensions = primary.data.dimensions;

  if (state.compareMode && state.selectedCivIds.length > 1) {
    grid.innerHTML = dimensions.map((dim) => renderCompareRow(dim)).join('');
  } else {
    const snap = findNearestSnapshot(primary.data.snapshots, state.currentYear);
    grid.innerHTML = dimensions.map((dim) => renderSoloCard(dim, snap)).join('');
  }

  grid.querySelectorAll('[data-dim-id]').forEach((card) => {
    const dimId = card.dataset.dimId;
    card.addEventListener('mouseenter', () => {
      state.highlightedDimId = dimId;
      updateCardHighlights();
      drawRadar();
    });
    card.addEventListener('mouseleave', () => {
      state.highlightedDimId = null;
      updateCardHighlights();
      drawRadar();
    });
    card.addEventListener('click', () => {
      if (state.expandedCards.has(dimId)) state.expandedCards.delete(dimId);
      else state.expandedCards.add(dimId);
      card.classList.toggle('expanded');
    });
  });

  updateCardHighlights();
}

function renderSoloCard(dim, snap) {
  const civ = getPrimaryCiv();
  const d = snap.dimensions[dim.id] || { confidence: 'absent', summary: '', level: null };
  const conf = d.confidence || 'absent';
  const label = civ.data.confidenceLabels[conf] || conf;
  const expanded = state.expandedCards.has(dim.id);
  const noteHtml = d.note ? `<p class="dim-note">${d.note}</p>` : '';

  if (conf === 'absent') {
    return `
      <div class="dim-card confidence-absent" data-dim-id="${dim.id}">
        <div class="dim-header">
          <span class="dim-label">${dim.label}</span>
          <span class="dim-badge badge-absent">${label}</span>
        </div>
        <p class="dim-summary">—</p>
      </div>`;
  }

  const barWidth = d.level ? (d.level / 5) * 100 : 0;

  return `
    <div class="dim-card confidence-${conf} ${expanded ? 'expanded' : ''}" data-dim-id="${dim.id}">
      <div class="dim-header">
        <span class="dim-label">${dim.label}</span>
        <span class="dim-badge badge-${conf}">${label}</span>
      </div>
      ${d.level ? `<div class="dim-level-bar"><span class="dim-level-fill" style="width:${barWidth}%"></span><span class="dim-level-text">${d.level}/5</span></div>` : ''}
      <p class="dim-summary">${d.summary}</p>
      ${noteHtml}
    </div>`;
}

function renderCompareRow(dim) {
  const entries = getSelectedCivs().map((civ) => {
    const snap = findNearestSnapshot(civ.data.snapshots, state.currentYear);
    const inRange = isSnapInRange(snap, state.currentYear);
    if (!inRange) {
      return `<div class="compare-entry" style="--civ-color:${civ.color}"><span class="compare-civ">${civ.name}</span><span class="muted">该时段无快照</span></div>`;
    }
    const d = snap.dimensions[dim.id] || { confidence: 'absent', summary: '—', level: null };
    const conf = d.confidence || 'absent';
    const confLabel = civ.data.confidenceLabels[conf] || conf;
    const levelText = d.level ? `${d.level}/5` : '—';
    return `
      <div class="compare-entry" style="--civ-color:${civ.color}">
        <span class="compare-civ">${civ.name}</span>
        <span class="compare-meta">${levelText} <span class="dim-badge badge-${conf}">${confLabel}</span></span>
        <span class="compare-summary">${d.summary}</span>
      </div>`;
  }).join('');

  return `
    <div class="dim-compare-row ${state.highlightedDimId === dim.id ? 'highlighted' : ''}" data-dim-id="${dim.id}">
      <h4 class="compare-dim-title">${dim.label}</h4>
      <div class="compare-entries">${entries}</div>
    </div>`;
}

function updateCardHighlights() {
  document.querySelectorAll('[data-dim-id]').forEach((el) => {
    el.classList.toggle('highlighted', el.dataset.dimId === state.highlightedDimId);
  });
}

function renderCompareLegend() {
  const el = $('#compare-legend');
  const aux = $('#radar-aux-label');

  if (state.compareMode && state.selectedCivIds.length > 1) {
    el.hidden = false;
    el.innerHTML = getSelectedCivs().map((civ, i) => {
      const snap = findNearestSnapshot(civ.data.snapshots, state.currentYear);
      const era = isSnapInRange(snap, state.currentYear) ? snap.eraLabel : '无快照';
      const style = i === 0 ? 'solid' : 'dashed';
      return `<span class="legend-item legend-${style}"><span class="civ-dot" style="background:${civ.color}"></span>${civ.name} · ${era}</span>`;
    }).join('');
    aux.hidden = true;
    return;
  }

  el.hidden = true;

  if (state.showAverage) {
    const info = calcAverageInfo(state.currentYear);
    if (info) {
      aux.hidden = false;
      aux.textContent = `同期均值（n=${info.civCount} 文明，非加权算术平均）`;
      return;
    }
  }

  aux.hidden = true;
}

function resizeRadarCanvas() {
  const canvas = $('#radar-canvas');
  const size = window.innerWidth <= 600 ? 220 : window.innerWidth <= 900 ? 240 : 280;
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
}

function getRadarLayout() {
  const canvas = $('#radar-canvas');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.34;
  const dims = getPrimaryCiv().data.dimensions;
  const n = dims.length;

  const axes = dims.map((dim, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      dim,
      angle,
      x2: cx + maxR * Math.cos(angle),
      y2: cy + maxR * Math.sin(angle),
      lx: cx + (maxR + 18) * Math.cos(angle),
      ly: cy + (maxR + 18) * Math.sin(angle),
    };
  });

  return { w, h, cx, cy, maxR, dims, n, axes };
}

function drawRadar() {
  const canvas = $('#radar-canvas');
  const ctx = canvas.getContext('2d');
  const layout = getRadarLayout();
  state.radarLayout = layout;
  const { w, h, cx, cy, maxR, n, axes } = layout;
  const primary = getPrimaryCiv();
  const primarySnap = findNearestSnapshot(primary.data.snapshots, state.currentYear);
  const inRange = isSnapInRange(primarySnap, state.currentYear);

  ctx.clearRect(0, 0, w, h);

  for (let ring = 1; ring <= 5; ring++) {
    ctx.beginPath();
    const r = (maxR * ring) / 5;
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#2e3344';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  axes.forEach((axis, i) => {
    const highlighted = axis.dim.id === state.highlightedDimId;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(axis.x2, axis.y2);
    ctx.strokeStyle = highlighted ? '#9aa3b5' : '#2e3344';
    ctx.lineWidth = highlighted ? 2 : 1;
    ctx.stroke();

    ctx.font = '11px sans-serif';
    ctx.fillStyle = highlighted ? '#e8eaef' : '#9aa3b5';
    ctx.textAlign = Math.abs(Math.cos(axis.angle)) < 0.1 ? 'center' : Math.cos(axis.angle) > 0 ? 'left' : 'right';
    ctx.textBaseline = Math.abs(Math.sin(axis.angle)) < 0.1 ? 'middle' : Math.sin(axis.angle) > 0 ? 'top' : 'bottom';
    ctx.fillText(axis.dim.short, axis.lx, axis.ly);
  });

  if (!inRange) return;

  if (state.showAverage && !state.compareMode) {
    const avgInfo = calcAverageInfo(state.currentYear);
    if (avgInfo) {
      drawPolygon(ctx, layout, (dimId) => avgInfo.levelsByDim[dimId], {
        stroke: '#6b7280',
        fill: 'rgba(107, 114, 128, 0.15)',
        lineWidth: 1.5,
        dash: COMPARE_DASH,
      });
    }
  }

  if (state.compareMode && state.selectedCivIds.length > 1) {
    const civs = getSelectedCivs();
    for (let i = civs.length - 1; i >= 1; i--) {
      const civ = civs[i];
      const snap = findNearestSnapshot(civ.data.snapshots, state.currentYear);
      if (!isSnapInRange(snap, state.currentYear)) continue;
      drawPolygon(ctx, layout, (dimId) => getDimLevel(snap.dimensions[dimId]), {
        stroke: civ.color,
        fill: null,
        lineWidth: 1.5,
        dash: COMPARE_DASH,
      });
    }
  }

  const mainCiv = state.compareMode ? getSelectedCivs()[0] : primary;
  const mainSnap = findNearestSnapshot(mainCiv.data.snapshots, state.currentYear);
  if (isSnapInRange(mainSnap, state.currentYear)) {
    const showDots = !state.compareMode || state.selectedCivIds.length === 1;
    drawPolygon(ctx, layout, (dimId) => getDimLevel(mainSnap.dimensions[dimId]), {
      stroke: mainCiv.color,
      fill: mainCiv.color + '33',
      lineWidth: 2,
      dash: null,
      dots: showDots ? mainSnap.dimensions : null,
    });
  }
}

function drawPolygon(ctx, layout, levelFn, style) {
  const { cx, cy, maxR, n, dims } = layout;
  const points = dims.map((dim, i) => {
    const level = levelFn(dim.id) || 0;
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (maxR * level) / 5;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      level,
      dim,
      d: style.dots?.[dim.id],
    };
  });

  const hasShape = points.some((p) => p.level > 0);
  if (!hasShape) return;

  ctx.beginPath();
  points.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.closePath();

  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fill();
  }

  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.lineWidth;
  if (style.dash) ctx.setLineDash(style.dash);
  else ctx.setLineDash([]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (style.dots) {
    points.forEach((p) => {
      if (p.level <= 0) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = CONFIDENCE_COLORS[p.d?.confidence] || CONFIDENCE_COLORS.absent;
      ctx.fill();
    });
  }
}

function onRadarMouseMove(e) {
  const canvas = $('#radar-canvas');
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const layout = state.radarLayout || getRadarLayout();
  const { cx, cy } = layout;

  const angle = Math.atan2(y - cy, x - cx);
  const n = layout.n;
  let bestIdx = 0;
  let bestDiff = Infinity;

  layout.axes.forEach((axis, i) => {
    let diff = Math.abs(angle - axis.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  });

  const dist = Math.hypot(x - cx, y - cy);
  const wedgeThreshold = Math.PI / n + 0.15;
  const newDim = dist > 20 && bestDiff < wedgeThreshold ? layout.dims[bestIdx].id : null;

  if (newDim !== state.highlightedDimId) {
    state.highlightedDimId = newDim;
    updateCardHighlights();
    drawRadar();
  }
}

init().catch(console.error);
