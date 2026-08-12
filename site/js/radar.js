/**
 * CivSlice 双雷达绘制模块
 */
const CivRadar = (() => {
  const CONFIDENCE_COLORS = {
    documented: '#4ade80',
    inferred: '#60a5fa',
    speculative: '#fbbf24',
    absent: '#4b5563',
  };

  function resizeCanvas(canvas) {
    const size = window.innerWidth <= 600 ? 220 : window.innerWidth <= 900 ? 240 : 280;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    return size;
  }

  function buildLayout(canvas, axes, maxValue) {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.34;
    const n = axes.length;

    const layoutAxes = axes.map((axis, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return {
        ...axis,
        angle,
        x2: cx + maxR * Math.cos(angle),
        y2: cy + maxR * Math.sin(angle),
        lx: cx + (maxR + 18) * Math.cos(angle),
        ly: cy + (maxR + 18) * Math.sin(angle),
      };
    });

    return { w, h, cx, cy, maxR, n, axes: layoutAxes, maxValue, axisIds: axes.map((a) => a.id) };
  }

  function drawGrid(ctx, layout, rings = 5) {
    const { cx, cy, maxR, n } = layout;
    for (let ring = 1; ring <= rings; ring++) {
      ctx.beginPath();
      const r = (maxR * ring) / rings;
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
  }

  function drawAxes(ctx, layout, highlightedId, labelFn) {
    const { cx, cy, axes } = layout;
    axes.forEach((axis) => {
      const highlighted = axis.id === highlightedId;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(axis.x2, axis.y2);
      ctx.strokeStyle = highlighted ? '#9aa3b5' : '#2e3344';
      ctx.lineWidth = highlighted ? 2 : 1;
      ctx.stroke();

      const label = labelFn(axis);
      ctx.font = axis.short?.length > 2 ? '9px sans-serif' : '11px sans-serif';
      ctx.fillStyle = highlighted ? '#e8eaef' : '#9aa3b5';
      ctx.textAlign = Math.abs(Math.cos(axis.angle)) < 0.1 ? 'center' : Math.cos(axis.angle) > 0 ? 'left' : 'right';
      ctx.textBaseline = Math.abs(Math.sin(axis.angle)) < 0.1 ? 'middle' : Math.sin(axis.angle) > 0 ? 'top' : 'bottom';
      ctx.fillText(label, axis.lx, axis.ly);

      if (axis.nullLabel) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText('N/A', axis.lx, axis.ly + 12);
      }
    });
  }

  function valueToRadius(value, layout) {
    if (value == null || value <= 0) return 0;
    return (layout.maxR * value) / layout.maxValue;
  }

  function drawPolygon(ctx, layout, valueFn, style) {
    const { cx, cy, n, axes, maxValue } = layout;
    const points = axes.map((axis, i) => {
      const raw = valueFn(axis.id, axis);
      const value = raw == null ? 0 : raw;
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (layout.maxR * value) / maxValue;
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        value,
        axis,
        meta: style.metaFn?.(axis.id, axis),
      };
    });

    const hasShape = points.some((p) => p.value > 0);
    if (!hasShape) return;

    ctx.beginPath();
    points.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
    ctx.closePath();

    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }

    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.lineWidth ?? 2;
    ctx.setLineDash(style.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);

    if (style.dots) {
      points.forEach((p) => {
        if (p.value <= 0) return;
        const conf = p.meta?.confidence;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        if (conf === 'speculative' && style.hollowSpeculative) {
          ctx.strokeStyle = CONFIDENCE_COLORS.speculative;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (conf) {
          ctx.fillStyle = CONFIDENCE_COLORS[conf] || CONFIDENCE_COLORS.absent;
          ctx.fill();
        } else {
          ctx.fillStyle = style.stroke;
          ctx.fill();
        }
      });
    }
  }

  function getProfileLevel(dim, mode) {
    if (!dim || dim.confidence === 'absent' || dim.level == null) return 0;
    if (mode === 'solid') {
      return dim.confidence === 'documented' || dim.confidence === 'inferred' ? dim.level : 0;
    }
    return dim.confidence !== 'absent' ? dim.level : 0;
  }

  function drawProfileRadar(ctx, layout, options) {
    const { snapshot, color, showSpeculative, showAverage, avgLevels, overlays } = options;

    ctx.clearRect(0, 0, layout.w, layout.h);
    drawGrid(ctx, layout, 5);
    drawAxes(ctx, layout, options.highlightedId, (a) => a.short);

    if (!snapshot) return;

    if (showAverage && avgLevels) {
      drawPolygon(ctx, layout, (id) => avgLevels[id], {
        stroke: '#6b7280',
        fill: 'rgba(107, 114, 128, 0.15)',
        lineWidth: 1.5,
        dash: [6, 4],
      });
    }

    if (overlays?.length) {
      for (const ov of overlays) {
        drawPolygon(ctx, layout, (id) => getProfileLevel(ov.snapshot.dimensions[id], 'full'), {
          stroke: ov.color,
          fill: null,
          lineWidth: 1.5,
          dash: [6, 4],
        });
      }
    }

    if (showSpeculative) {
      drawPolygon(ctx, layout, (id) => getProfileLevel(snapshot.dimensions[id], 'full'), {
        stroke: color,
        fill: color + '18',
        lineWidth: 1.5,
        dash: [4, 3],
        dots: true,
        hollowSpeculative: true,
        metaFn: (id) => snapshot.dimensions[id],
      });
    }

    drawPolygon(ctx, layout, (id) => getProfileLevel(snapshot.dimensions[id], 'solid'), {
      stroke: color,
      fill: color + '33',
      lineWidth: 2,
      dots: true,
      metaFn: (id) => snapshot.dimensions[id],
    });
  }

  function drawCompareRadar(ctx, layout, options) {
    const { statsList, colors, showAverage, avgStats, highlightedId } = options;

    ctx.clearRect(0, 0, layout.w, layout.h);
    drawGrid(ctx, layout, 5);
    drawAxes(ctx, layout, highlightedId, (a) => a.short);

    if (showAverage && avgStats) {
      drawPolygon(ctx, layout, (id) => avgStats[id], {
        stroke: '#6b7280',
        fill: 'rgba(107, 114, 128, 0.15)',
        lineWidth: 1.5,
        dash: [6, 4],
      });
    }

    for (let i = statsList.length - 1; i >= 1; i--) {
      const stats = statsList[i];
      drawPolygon(ctx, layout, (id) => stats[id], {
        stroke: colors[i],
        fill: null,
        lineWidth: 1.5,
        dash: [6, 4],
      });
    }

    if (statsList.length > 0) {
      drawPolygon(ctx, layout, (id) => statsList[0][id], {
        stroke: colors[0],
        fill: colors[0] + '33',
        lineWidth: 2,
        dots: true,
      });
    }
  }

  function hitTest(layout, x, y) {
    const { cx, cy, n, axes } = layout;
    const angle = Math.atan2(y - cy, x - cx);
    let bestIdx = 0;
    let bestDiff = Infinity;

    axes.forEach((axis, i) => {
      let diff = Math.abs(angle - axis.angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    });

    const dist = Math.hypot(x - cx, y - cy);
    const wedgeThreshold = Math.PI / n + 0.15;
    if (dist > 20 && bestDiff < wedgeThreshold) {
      return axes[bestIdx].id;
    }
    return null;
  }

  return {
    CONFIDENCE_COLORS,
    resizeCanvas,
    buildLayout,
    drawGrid,
    drawAxes,
    drawPolygon,
    drawProfileRadar,
    drawCompareRadar,
    hitTest,
    getProfileLevel,
  };
})();
