/**
 * CivSlice 派生指标计算模块
 * 公式权威来源：Talk 对比雷达与派生指标 + 时代维度模板
 */
const CivStats = (() => {
  const CONFIDENCE_MUL = {
    documented: 1.0,
    inferred: 0.85,
    speculative: 0.5,
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

  const STAT_WEIGHTS_BY_ERA = {
    bronze: {
      mobilization: { organization: 0.35, state_formation: 0.40, subsistence: 0.25 },
      innovation: { knowledge: 0.40, metallurgy: 0.35, writing: 0.25 },
      prosperity: { trade: 0.55, subsistence: 0.45 },
      stability: { organization: 0.50, ritual_order: 0.50 },
      livelihood: { subsistence: 0.65, geography: 0.35 },
      influence: { state_formation: 0.35, geography: 0.30, trade: 0.35 },
    },
    iron_imperial: {
      mobilization: { organization: 0.35, military: 0.40, bureaucracy: 0.25 },
      innovation: { knowledge: 0.50, iron_tech: 0.35, historiography: 0.15 },
      prosperity: { commerce: 0.55, subsistence: 0.45 },
      stability: { organization: 0.45, bureaucracy: 0.35, historiography: 0.20 },
      livelihood: { subsistence: 0.60, geography: 0.40 },
      influence: { military: 0.35, geography: 0.30, commerce: 0.35 },
    },
    early_modern: {
      mobilization: { organization: 0.30, firearms: 0.40, fiscal_state: 0.30 },
      innovation: { knowledge: 0.35, printing: 0.35, firearms: 0.30 },
      prosperity: { maritime: 0.50, subsistence: 0.30, organization: 0.20 },
      stability: { organization: 0.45, fiscal_state: 0.35, confession: 0.20 },
      livelihood: { subsistence: 0.60, geography: 0.40 },
      influence: { firearms: 0.35, maritime: 0.35, geography: 0.30 },
    },
    industrial: {
      mobilization: { organization: 0.30, industry: 0.40, nationalism: 0.30 },
      innovation: { knowledge: 0.35, industry: 0.40, infrastructure: 0.25 },
      prosperity: { industry: 0.45, infrastructure: 0.30, urbanization: 0.25 },
      stability: { organization: 0.45, nationalism: 0.35, industry: 0.20 },
      livelihood: { subsistence: 0.40, public_health: 0.35, urbanization: 0.25 },
      influence: { industry: 0.30, infrastructure: 0.35, geography: 0.35 },
    },
    contemporary: {
      mobilization: { organization: 0.35, industrial_capacity: 0.35, global_integration: 0.30 },
      innovation: { knowledge: 0.30, industrial_capacity: 0.35, information: 0.35 },
      prosperity: { industrial_capacity: 0.40, global_integration: 0.35, subsistence: 0.25 },
      stability: { organization: 0.50, education: 0.30, culture: 0.20 },
      livelihood: { healthcare: 0.40, subsistence: 0.35, education: 0.25 },
      influence: { global_integration: 0.40, industrial_capacity: 0.30, geography: 0.30 },
    },
    neolithic: {
      mobilization: { organization: 0.40, settlement: 0.35, subsistence: 0.25 },
      innovation: { knowledge: 0.45, pottery: 0.35, agriculture: 0.20 },
      prosperity: { agriculture: 0.55, subsistence: 0.45 },
      stability: { organization: 0.50, ritual: 0.50 },
      livelihood: { subsistence: 0.60, agriculture: 0.40 },
      influence: { settlement: 0.40, geography: 0.35, agriculture: 0.25 },
    },
    paleolithic: {
      mobilization: { organization: 0.35, band_cohesion: 0.40, foraging: 0.25 },
      innovation: { knowledge: 0.50, toolkit: 0.50 },
      prosperity: { foraging: 0.60, subsistence: 0.40 },
      stability: { organization: 0.50, band_cohesion: 0.50 },
      livelihood: { subsistence: 0.55, foraging: 0.45 },
      influence: { mobility: 0.45, geography: 0.35, band_cohesion: 0.20 },
    },
  };

  function getWeightsForEra(eraTemplate) {
    return STAT_WEIGHTS_BY_ERA[eraTemplate] || STAT_WEIGHTS_BY_ERA.iron_imperial;
  }

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

  function computeAllStats(snapshot, eraTemplate) {
    const tpl = eraTemplate || snapshot.eraTemplate || 'iron_imperial';
    const eraWeights = getWeightsForEra(tpl);
    const result = {};

    for (const stat of STAT_DEFINITIONS) {
      if (stat.id === 'evidence') {
        result[stat.id] = computeEvidence(snapshot);
      } else {
        result[stat.id] = computeStat(snapshot, eraWeights[stat.id] || {});
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

  function getStatBreakdown(snapshot, statId, dimensionMap, eraTemplate) {
    const tpl = eraTemplate || snapshot.eraTemplate || 'iron_imperial';

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

    const eraWeights = getWeightsForEra(tpl);
    const weights = eraWeights[statId];
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

  function periodAverageStat(year, statId, civilizations, tolerance, findNearest, isInRange, resolveSnap) {
    const values = civilizations
      .map((civ) => {
        const raw = findNearest(civ.data.snapshots, year);
        if (!isInRange(raw, year)) return null;
        const snap = resolveSnap ? resolveSnap(raw) : raw;
        if (statId === 'evidence') return computeEvidence(snap);
        const weights = getWeightsForEra(snap.eraTemplate)[statId];
        return computeStat(snap, weights || {});
      })
      .filter((v) => v != null);

    if (values.length < 2) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  function periodAverageAllStats(year, civilizations, tolerance, findNearest, isInRange, resolveSnap) {
    const result = {};
    for (const stat of STAT_DEFINITIONS) {
      result[stat.id] = periodAverageStat(year, stat.id, civilizations, tolerance, findNearest, isInRange, resolveSnap);
    }
    const civCount = civilizations.filter((civ) => {
      const snap = findNearest(civ.data.snapshots, year);
      return isInRange(snap, year);
    }).length;
    return civCount >= 2 ? { stats: result, civCount } : null;
  }

  function isSpeculativeHeavy(snapshot, statId, eraTemplate) {
    if (statId === 'evidence') return false;
    const tpl = eraTemplate || snapshot.eraTemplate || 'iron_imperial';
    const weights = getWeightsForEra(tpl)[statId];
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
    STAT_WEIGHTS_BY_ERA,
    STAT_DEFINITIONS,
    CONFIDENCE_MUL,
    getWeightsForEra,
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
