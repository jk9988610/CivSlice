/**
 * CivSlice 派生指标计算模块
 * 公式权威来源：Talk/docs/07-projects/2026-08-12-CivSlice-对比雷达与派生指标.md
 */
const CivStats = (() => {
  const CONFIDENCE_MUL = {
    documented: 1.0,
    inferred: 0.85,
    speculative: 0.5,
  };

  const STAT_WEIGHTS = {
    mobilization: { politics: 0.35, military: 0.40, production: 0.25 },
    innovation: { technology: 0.65, culture: 0.35 },
    prosperity: { economy: 0.55, production: 0.45 },
    stability: { politics: 0.50, historical_memory: 0.50 },
    livelihood: { daily_life: 0.55, resources: 0.45 },
    influence: { military: 0.35, geography: 0.30, economy: 0.35 },
  };

  const STAT_DEFINITIONS = [
    { id: 'mobilization', label: '动员力', short: 'MOB' },
    { id: 'innovation', label: '创新力', short: 'INN' },
    { id: 'prosperity', label: '繁荣度', short: 'PRO' },
    { id: 'stability', label: '制度稳', short: 'STA' },
    { id: 'livelihood', label: '民生力', short: 'LIV' },
    { id: 'influence', label: '影响力', short: 'INF' },
    { id: 'evidence', label: '记录度', short: 'EVI' },
  ];

  const GRADE_TABLE = [
    { min: 85, grade: 'S' },
    { min: 70, grade: 'A' },
    { min: 55, grade: 'B' },
    { min: 40, grade: 'C' },
    { min: 25, grade: 'D' },
    { min: 0, grade: 'E' },
  ];

  function computeStat(snapshot, weights) {
    let sum = 0;
    let weightSum = 0;

    for (const [dimId, wgt] of Object.entries(weights)) {
      const d = snapshot.dimensions?.[dimId];
      if (!d || d.confidence === 'absent' || d.level == null) continue;

      const confMul = CONFIDENCE_MUL[d.confidence] ?? 0;
      if (confMul === 0) continue;

      sum += d.level * wgt * confMul;
      weightSum += wgt * confMul;
    }

    if (weightSum < 0.25) return null;
    return Math.round((sum / weightSum / 5) * 100);
  }

  function computeEvidence(snapshot) {
    const dims = Object.values(snapshot.dimensions || {});
    if (!dims.length) return null;

    const scores = { documented: 1.0, inferred: 0.65, speculative: 0.35, absent: 0 };
    let total = 0;
    for (const d of dims) {
      total += scores[d.confidence] ?? 0;
    }
    return Math.round((total / dims.length) * 100);
  }

  function computeAllStats(snapshot) {
    const result = {};
    for (const stat of STAT_DEFINITIONS) {
      if (stat.id === 'evidence') {
        result[stat.id] = computeEvidence(snapshot);
      } else {
        result[stat.id] = computeStat(snapshot, STAT_WEIGHTS[stat.id]);
      }
    }
    return result;
  }

  function getGrade(score) {
    if (score == null) return '—';
    for (const { min, grade } of GRADE_TABLE) {
      if (score >= min) return grade;
    }
    return 'E';
  }

  function getStatBreakdown(snapshot, statId, dimensionMap) {
    if (statId === 'evidence') {
      const dims = Object.entries(snapshot.dimensions || {});
      const wgt = dims.length ? 1 / dims.length : 0;
      return dims.map(([dimId, d]) => ({
        dimId,
        dimLabel: dimensionMap[dimId] || dimId,
        level: null,
        weight: wgt,
        confidence: d.confidence,
        contribution: ({ documented: 1.0, inferred: 0.65, speculative: 0.35, absent: 0 })[d.confidence] ?? 0,
        display: `${dimensionMap[dimId] || dimId}（${d.confidence}）`,
      }));
    }

    const weights = STAT_WEIGHTS[statId];
    if (!weights) return [];

    return Object.entries(weights).map(([dimId, wgt]) => {
      const d = snapshot.dimensions?.[dimId];
      if (!d || d.confidence === 'absent' || d.level == null) {
        return {
          dimId,
          dimLabel: dimensionMap[dimId] || dimId,
          level: null,
          weight: wgt,
          confidence: 'absent',
          contribution: null,
          display: `${dimensionMap[dimId] || dimId}（未记录）`,
        };
      }
      const confMul = CONFIDENCE_MUL[d.confidence] ?? 0;
      const contribution = d.level * wgt * confMul;
      return {
        dimId,
        dimLabel: dimensionMap[dimId] || dimId,
        level: d.level,
        weight: wgt,
        confidence: d.confidence,
        contribution,
        display: `${dimensionMap[dimId] || dimId}(${d.level})×${wgt}`,
      };
    });
  }

  function formatBreakdown(breakdown) {
    const parts = breakdown
      .filter((b) => b.contribution != null && b.contribution > 0)
      .map((b) => b.display);
    return parts.length ? parts.join(' + ') : '数据不足';
  }

  function periodAverageStat(year, statId, civilizations, tolerance, findNearest, isInRange) {
    const values = civilizations
      .map((civ) => {
        const snap = findNearest(civ.data.snapshots, year);
        if (!isInRange(snap, year)) return null;
        if (statId === 'evidence') return computeEvidence(snap);
        return computeStat(snap, STAT_WEIGHTS[statId]);
      })
      .filter((v) => v != null);

    if (values.length < 2) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  function periodAverageAllStats(year, civilizations, tolerance, findNearest, isInRange) {
    const result = {};
    for (const stat of STAT_DEFINITIONS) {
      result[stat.id] = periodAverageStat(year, stat.id, civilizations, tolerance, findNearest, isInRange);
    }
    const civCount = civilizations.filter((civ) => {
      const snap = findNearest(civ.data.snapshots, year);
      return isInRange(snap, year);
    }).length;
    return civCount >= 2 ? { stats: result, civCount } : null;
  }

  function isSpeculativeHeavy(snapshot, statId) {
    if (statId === 'evidence') return false;
    const weights = STAT_WEIGHTS[statId];
    if (!weights) return false;
    let specW = 0;
    let totalW = 0;
    for (const [dimId, wgt] of Object.entries(weights)) {
      const d = snapshot.dimensions?.[dimId];
      if (!d || d.confidence === 'absent' || d.level == null) continue;
      totalW += wgt;
      if (d.confidence === 'speculative') specW += wgt;
    }
    return totalW > 0 && specW / totalW > 0.5;
  }

  return {
    STAT_WEIGHTS,
    STAT_DEFINITIONS,
    CONFIDENCE_MUL,
    computeStat,
    computeEvidence,
    computeAllStats,
    getGrade,
    getStatBreakdown,
    formatBreakdown,
    periodAverageStat,
    periodAverageAllStats,
    isSpeculativeHeavy,
  };
})();
