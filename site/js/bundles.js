/**
 * CivSlice v3 比较束 — 同时代对照的建议 aspect 目录
 * 权威：Talk/docs/07-projects/2026-08-12-CivSlice-时代维度模板.md（v3 比较束定位）
 */
const CivBundles = (() => {
  let registry = {};

  async function load() {
    try {
      const res = await fetch('data/meta/comparisonBundles.json');
      const data = await res.json();
      registry = data.bundles || {};
    } catch {
      registry = {};
    }
  }

  function getBundle(bundleId) {
    return registry[bundleId] || null;
  }

  function getSuggestedAspectIds(bundleId) {
    const bundle = getBundle(bundleId);
    if (!bundle) return [];
    return [...(bundle.core || []), ...(bundle.modules || [])];
  }

  function orderAspectIds(aspectIds, bundleId) {
    const suggested = getSuggestedAspectIds(bundleId);
    if (!suggested.length) {
      return { ordered: [...aspectIds].sort(), missing: [] };
    }

    const suggestedSet = new Set(suggested);
    const inBundle = suggested.filter((id) => aspectIds.includes(id));
    const extra = [...aspectIds].filter((id) => !suggestedSet.has(id)).sort();
    const missing = suggested.filter((id) => !aspectIds.includes(id));
    return { ordered: [...inBundle, ...extra], missing };
  }

  return {
    load,
    getBundle,
    getSuggestedAspectIds,
    orderAspectIds,
  };
})();
