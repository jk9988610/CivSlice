/**
 * CivSlice 三级导航 — 时代段 / 实体 / 段内时间轴
 * 权威来源：Talk/docs/07-projects/2026-08-12-CivSlice-时间轴交互流程.md
 */
const CivNav = (() => {
  const ERA_PERIODS = [
    { id: 'paleolithic', label: '石器时代', shortLabel: '石器', yearMin: -12000, yearMax: -10000, eraTemplate: 'paleolithic' },
    { id: 'neolithic', label: '新石器', shortLabel: '新石器', yearMin: -10000, yearMax: -4000, eraTemplate: 'neolithic' },
    { id: 'bronze', label: '青铜时代', shortLabel: '青铜', yearMin: -4000, yearMax: -1000, eraTemplate: 'bronze' },
    { id: 'iron_imperial', label: '铁器与帝国', shortLabel: '铁器帝国', yearMin: -1000, yearMax: 1500, eraTemplate: 'iron_imperial' },
    { id: 'early_modern', label: '近代早期', shortLabel: '近代早期', yearMin: 1500, yearMax: 1800, eraTemplate: 'early_modern' },
    { id: 'industrial', label: '工业时代', shortLabel: '工业', yearMin: 1800, yearMax: 1945, eraTemplate: 'industrial' },
    { id: 'contemporary', label: '当代', shortLabel: '当代', yearMin: 1945, yearMax: 2024, eraTemplate: 'contemporary' },
  ];

  function getPeriod(id) {
    return ERA_PERIODS.find((p) => p.id === id) || null;
  }

  function getYearStep(yearMin, yearMax) {
    const span = yearMax - yearMin;
    if (span > 2000) return 50;
    if (span < 500) return span <= 80 ? 5 : 10;
    return 25;
  }

  function getSnapTolerance(period) {
    const span = period.yearMax - period.yearMin;
    return Math.min(350, Math.max(40, Math.floor(span / 6)));
  }

  function snapshotInPeriod(snap, period) {
    return snap.year >= period.yearMin && snap.year <= period.yearMax;
  }

  function snapshotsInPeriod(snapshots, period) {
    return snapshots.filter((s) => snapshotInPeriod(s, period));
  }

  function civilizationsInPeriod(civilizations, period) {
    return civilizations.filter((civ) =>
      civ.data.snapshots.some((s) => snapshotInPeriod(s, period))
    );
  }

  function getGroupChips(civ, period) {
    const snaps = snapshotsInPeriod(civ.data.snapshots, period);
    const seen = new Map();
    snaps.forEach((s) => {
      const key = s.group || s.eraLabel;
      if (!seen.has(key)) seen.set(key, s);
    });
    return [...seen.entries()].map(([label, snap]) => ({
      id: label,
      label,
      year: snap.year,
      dynasty: snap.dynasty || label,
      eraLabel: snap.eraLabel,
    }));
  }

  function findDefaultPeriod(civilizations, civId = 'china') {
    const civ = civilizations.find((c) => c.id === civId) || civilizations[0];
    if (!civ) return ERA_PERIODS[2];
    for (const period of ERA_PERIODS) {
      if (civ.data.snapshots.some((s) => snapshotInPeriod(s, period))) {
        return period;
      }
    }
    return ERA_PERIODS[2];
  }

  function defaultYearForPeriod(civ, period, groupId) {
    const snaps = snapshotsInPeriod(civ.data.snapshots, period);
    if (!snaps.length) return period.yearMin;

    if (groupId) {
      const match = snaps.find((s) => (s.group || s.eraLabel) === groupId);
      if (match) return match.year;
    }

    const mid = (period.yearMin + period.yearMax) / 2;
    return snaps.reduce((best, s) =>
      Math.abs(s.year - mid) < Math.abs(best.year - mid) ? s : best
    ).year;
  }

  function formatPeriodRange(period, formatYear) {
    const min = period.yearMin <= -9999 ? '更早' : formatYear(period.yearMin);
    const max = period.yearMax >= 9999 ? '至今' : formatYear(period.yearMax);
    return `${period.label} · ${min} — ${max}`;
  }

  function periodsWithData(civilizations) {
    return ERA_PERIODS.filter((period) =>
      civilizations.some((civ) =>
        civ.data.snapshots.some((s) => snapshotInPeriod(s, period))
      )
    );
  }

  function overlaps(presence, yearMin, yearMax) {
    return presence.start <= yearMax && presence.end >= yearMin;
  }

  function getPresenceInPeriod(civ, period) {
    const presenceList = civ.presence || civ.data?.meta?.presence || [];
    return presenceList.find((p) => overlaps(p, period.yearMin, period.yearMax)) ?? null;
  }

  function timelinesInPeriod(civilizations, period) {
    return civilizations
      .map((civ) => {
        const markers = snapshotsInPeriod(civ.data.snapshots, period);
        const presence = getPresenceInPeriod(civ, period);
        return {
          id: civ.id,
          name: civ.name,
          color: civ.color,
          civId: civ.id,
          markers,
          span: markers.length
            ? { start: Math.min(...markers.map((m) => m.year)), end: Math.max(...markers.map((m) => m.year)) }
            : null,
          presence,
          isDynasty: false,
        };
      })
      .filter((t) => t.markers.length > 0 || t.presence);
  }

  function timelinesByDynasty(civ, period) {
    const markers = snapshotsInPeriod(civ.data.snapshots, period);
    const groups = new Map();
    for (const m of markers) {
      const key = m.group || m.dynasty || m.eraLabel;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return [...groups.entries()].map(([label, ms]) => ({
      id: `${civ.id}:${label}`,
      label,
      name: label,
      color: civ.color,
      civId: civ.id,
      groupId: label,
      markers: ms.sort((a, b) => a.year - b.year),
      span: { start: Math.min(...ms.map((m) => m.year)), end: Math.max(...ms.map((m) => m.year)) },
      presence: null,
      isDynasty: true,
    }));
  }

  function getSwimlaneRows(civilizations, period, { viewTab, primaryCivId }) {
    if (!period) return [];

    if (viewTab === 'profile') {
      const primary = civilizations.find((c) => c.id === primaryCivId);
      if (primary) {
        const dynastyLanes = timelinesByDynasty(primary, period);
        if (dynastyLanes.length > 1) return dynastyLanes;
      }
    }

    return timelinesInPeriod(civilizations, period);
  }

  return {
    ERA_PERIODS,
    getPeriod,
    getYearStep,
    getSnapTolerance,
    snapshotInPeriod,
    snapshotsInPeriod,
    civilizationsInPeriod,
    getGroupChips,
    findDefaultPeriod,
    defaultYearForPeriod,
    formatPeriodRange,
    periodsWithData,
    overlaps,
    timelinesInPeriod,
    timelinesByDynasty,
    getSwimlaneRows,
  };
})();
