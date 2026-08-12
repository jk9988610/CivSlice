let data = null;
let currentYear = -500;
const SNAP_TOLERANCE = 350;

const $ = (sel) => document.querySelector(sel);

async function init() {
  const res = await fetch('data/china.json');
  data = await res.json();

  const { yearMin, yearMax, yearStep } = data.meta;
  const slider = $('#year-slider');
  slider.min = yearMin;
  slider.max = yearMax;
  slider.step = yearStep;
  slider.value = currentYear = data.snapshots[Math.floor(data.snapshots.length / 2)].year;

  $('#page-subtitle').textContent = data.meta.subtitle;

  buildTimelineTicks(yearMin, yearMax);
  buildSnapshotMarkers();
  buildMethodology();
  bindEvents();
  render();
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
  const { yearMin, yearMax } = data.meta;
  const range = yearMax - yearMin;
  const container = $('#snapshot-markers');

  container.innerHTML = data.snapshots.map((snap) => {
    const pct = ((snap.year - yearMin) / range) * 100;
    return `<button class="snap-marker" style="left:${pct}%"
      title="${formatYear(snap.year)} · ${snap.eraLabel}"
      data-year="${snap.year}"></button>`;
  }).join('');

  container.querySelectorAll('.snap-marker').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentYear = Number(btn.dataset.year);
      $('#year-slider').value = currentYear;
      render();
    });
  });
}

function buildMethodology() {
  const { principles, confidenceLevels } = data.meta.methodology;
  $('#methodology-list').innerHTML = principles.map((p) => `<li>${p}</li>`).join('');
  $('#confidence-dl').innerHTML = Object.entries(confidenceLevels)
    .map(([k, v]) => `<dt>${data.confidenceLabels[k]}</dt><dd>${v}</dd>`)
    .join('');
}

function bindEvents() {
  $('#year-slider').addEventListener('input', (e) => {
    currentYear = Number(e.target.value);
    render();
  });
  $('#btn-prev').addEventListener('click', () => stepYear(-1));
  $('#btn-next').addEventListener('click', () => stepYear(1));
}

function stepYear(dir) {
  const step = data.meta.yearStep;
  currentYear = Math.max(data.meta.yearMin, Math.min(data.meta.yearMax, currentYear + dir * step));
  $('#year-slider').value = currentYear;
  render();
}

function formatYear(year) {
  if (year < 0) return `公元前 ${Math.abs(year)} 年`;
  if (year === 0) return '公元元年';
  return `公元 ${year} 年`;
}

function findNearestSnapshot(year) {
  return data.snapshots.reduce((best, snap) =>
    Math.abs(snap.year - year) < Math.abs(best.year - year) ? snap : best
  );
}

function render() {
  const snap = findNearestSnapshot(currentYear);
  const inRange = Math.abs(snap.year - currentYear) <= SNAP_TOLERANCE;

  $('#year-display').textContent = formatYear(currentYear);
  $('#era-label').textContent = inRange ? snap.eraLabel : '该时段无快照';
  $('#world-context').textContent = inRange && snap.worldContext
    ? `世界背景：${snap.worldContext}`
    : `当前选择 ${formatYear(currentYear)}，最近快照为 ${formatYear(snap.year)}（${snap.eraLabel}），点击时间轴圆点可跳转。`;

  renderSnapshotInfo(snap, inRange);
  renderDimensionGrid(snap, inRange);
  drawRadar(snap, inRange, data.meta.color);
  updateMarkerHighlight(snap);
}

function updateMarkerHighlight(snap) {
  document.querySelectorAll('.snap-marker').forEach((m) => {
    m.classList.toggle('active', Number(m.dataset.year) === snap.year);
  });
}

function renderSnapshotInfo(snap, inRange) {
  const el = $('#snapshot-info');
  if (!inRange) {
    el.innerHTML = `
      <h3>暂无精确快照</h3>
      <p class="muted">请拖动滑块至时间轴圆点（●）附近，或点击圆点跳转至有记录的朝代。</p>
      <p class="muted">最近记录：<strong>${snap.eraLabel}</strong>（${formatYear(snap.year)}）</p>
    `;
    return;
  }

  const sources = snap.sources?.length
    ? `<div class="sources"><strong>参考来源</strong><ul>${snap.sources.map((s) => `<li>${s}</li>`).join('')}</ul></div>`
    : '';

  el.innerHTML = `
    <h3 style="color:${data.meta.color}">${data.meta.country}</h3>
    <p class="era-badge">${snap.eraLabel}</p>
    <p class="evidence-note"><strong>证据说明：</strong>${snap.evidenceNote}</p>
    ${sources}
    <p class="snap-diff muted">快照年份 ${formatYear(snap.year)}，与滑块位置相差 ${Math.abs(snap.year - currentYear)} 年</p>
  `;
}

function renderDimensionGrid(snap, inRange) {
  const grid = $('#dimension-grid');
  if (!inRange) {
    grid.innerHTML = '<p class="no-data">该时段无维度记录，请跳转至有快照的年代。</p>';
    return;
  }

  grid.innerHTML = data.dimensions.map((dim) => {
    const d = snap.dimensions[dim.id] || { confidence: 'absent', summary: '', level: null };
    const conf = d.confidence || 'absent';
    const label = data.confidenceLabels[conf] || conf;

    if (conf === 'absent') {
      return `
        <div class="dim-card confidence-absent">
          <div class="dim-header">
            <span class="dim-label">${dim.label}</span>
            <span class="dim-badge badge-absent">${label}</span>
          </div>
          <p class="dim-summary">—</p>
        </div>`;
    }

    return `
      <div class="dim-card confidence-${conf}">
        <div class="dim-header">
          <span class="dim-label">${dim.label}</span>
          <span class="dim-badge badge-${conf}">${label}</span>
        </div>
        ${d.level ? `<div class="dim-level">相对等级 ${d.level}/5</div>` : ''}
        <p class="dim-summary">${d.summary}</p>
      </div>`;
  }).join('');
}

function drawRadar(snap, inRange, color) {
  const canvas = $('#radar-canvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.36;
  const dims = data.dimensions;
  const n = dims.length;

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
    ctx.stroke();
  }

  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#9aa3b5';
  dims.forEach((dim, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x2 = cx + maxR * Math.cos(angle);
    const y2 = cy + maxR * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#2e3344';
    ctx.stroke();

    const lx = cx + (maxR + 22) * Math.cos(angle);
    const ly = cy + (maxR + 22) * Math.sin(angle);
    ctx.textAlign = Math.abs(Math.cos(angle)) < 0.1 ? 'center' : Math.cos(angle) > 0 ? 'left' : 'right';
    ctx.textBaseline = Math.abs(Math.sin(angle)) < 0.1 ? 'middle' : Math.sin(angle) > 0 ? 'top' : 'bottom';
    ctx.fillText(dim.short, lx, ly);
  });

  if (!inRange) return;

  const points = dims.map((dim, i) => {
    const d = snap.dimensions[dim.id];
    const level = d && d.confidence !== 'absent' && d.level ? d.level : 0;
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (maxR * level) / 5;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), level, d };
  });

  if (points.some((p) => p.level > 0)) {
    ctx.beginPath();
    points.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.fillStyle = color + '30';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const colors = { documented: '#4ade80', inferred: '#60a5fa', speculative: '#fbbf24', absent: '#4b5563' };
  points.forEach((p) => {
    if (p.level <= 0) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = colors[p.d?.confidence] || colors.absent;
    ctx.fill();
  });
}

init().catch(console.error);
