/**
 * CivSlice v2 五级导航 — 区域 / 时段 / 国家泳道 / 主时间轴 / 比较参与
 * 权威来源：Talk/docs/07-projects/2026-08-13-CivSlice-区域导航与比较选择.md
 */
const CivNav = (() => {
  const REGION_ORDER = [
    'world', 'asia', 'europe', 'africa',
    'oceania', 'north_america', 'south_america', 'antarctica',
  ];

  let regionsMeta = [];

  function init(meta) {
    regionsMeta = meta?.regions || [];
  }

  function getRegions() {
    return REGION_ORDER
      .map((id) => regionsMeta.find((r) => r.id === id))
      .filter(Boolean);
  }

  function getRegion(regionId) {
    return regionsMeta.find((r) => r.id === regionId) || null;
  }

  function getPeriod(regionId, periodId) {
    const region = getRegion(regionId);
    return region?.periods?.find((p) => p.id === periodId) || null;
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

  function civInPeriod(civ, period) {
    return civ.data.snapshots.some((s) => snapshotInPeriod(s, period));
  }

  function civilizationsInScope(regionId, period, civilizations) {
    if (!period) return [];
    if (regionId === 'world') {
      return civilizations.filter((civ) => civInPeriod(civ, period));
    }
    return civilizations.filter(
      (civ) => civ.regions?.includes(regionId) && civInPeriod(civ, period)
    );
  }

  function overlaps(presence, yearMin, yearMax) {
    return presence.start <= yearMax && presence.end >= yearMin;
  }

  function getPresenceInPeriod(civ, period) {
    const presenceList = civ.presence || civ.data?.meta?.presence || [];
    return presenceList.find((p) => overlaps(p, period.yearMin, period.yearMax)) ?? null;
  }

  function swimlanes(period, civilizations, selectedCountryIds) {
    if (!period) return [];
    return selectedCountryIds
      .map((id) => civilizations.find((c) => c.id === id))
      .filter(Boolean)
      .map((civ) => {
        const markers = snapshotsInPeriod(civ.data.snapshots, period);
        return {
          id: civ.id,
          name: civ.name,
          color: civ.color,
          civId: civ.id,
          markers,
          presence: getPresenceInPeriod(civ, period),
        };
      })
      .filter((lane) => lane.markers.length > 0);
  }

  function defaultYearForCiv(civ, period) {
    const snaps = snapshotsInPeriod(civ.data.snapshots, period);
    if (!snaps.length) return period.yearMin;
    const mid = (period.yearMin + period.yearMax) / 2;
    return snaps.reduce((best, s) =>
      Math.abs(s.year - mid) < Math.abs(best.year - mid) ? s : best
    ).year;
  }

  function findDefaultRegion() {
    return getRegion('asia') || getRegions()[0];
  }

  function findDefaultPeriod(regionId, civilizations) {
    const region = getRegion(regionId);
    if (!region?.periods?.length) return null;
    for (const period of region.periods) {
      if (civilizationsInScope(regionId, period, civilizations).length > 0) {
        return period;
      }
    }
    return region.periods[0];
  }

  function formatScopeLabel(region, period, formatYear) {
    if (!region || !period) return '';
    const min = period.yearMin <= -9999 ? '更早' : formatYear(period.yearMin);
    const max = period.yearMax >= 9999 ? '至今' : formatYear(period.yearMax);
    return `${region.label} · ${period.label} · ${min} — ${max}`;
  }

  function isAntarcticaEmpty(regionId) {
    return regionId === 'antarctica';
  }

  return {
    REGION_ORDER,
    init,
    getRegions,
    getRegion,
    getPeriod,
    getYearStep,
    getSnapTolerance,
    snapshotInPeriod,
    snapshotsInPeriod,
    civilizationsInScope,
    swimlanes,
    defaultYearForCiv,
    findDefaultRegion,
    findDefaultPeriod,
    formatScopeLabel,
    isAntarcticaEmpty,
    getPresenceInPeriod,
  };
})();
