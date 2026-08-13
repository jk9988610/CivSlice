/**
 * CivSlice v3 证据驱动层 — 快照规范化、aspects 读取、来源解析
 * 权威：Talk/docs/07-projects/2026-08-13-CivSlice-证据驱动数据标准.md
 */
const CivEvidence = (() => {
  const CONFIDENCE_LABELS = {
    documented: '有据',
    inferred: '推断',
    absent: '未记录',
  };

  const SOURCE_TYPE_LABELS = {
    archaeology: '考古',
    literature: '文献',
    epigraphy: '铭文',
    numismatics: '钱币',
    iconography: '图像',
    oral_tradition: '口传',
    mythology: '传说',
  };

  const GRADE_LABELS = {
    A: '考古/实物',
    B: '当代文献',
    C: '后世追述',
    D: '研究著作',
    E: '工具书',
    F: '待核实',
  };

  const RELATION_LABELS = {
    contemporaneous: '同时代',
    near_contemporaneous: '近同时代',
    later_retrospect: '后世追述',
  };

  function supportsDocumented(source) {
    return source && (source.grade === 'A' || source.grade === 'B');
  }

  let aspectCatalog = {};

  async function loadCatalog() {
    try {
      const res = await fetch('data/meta/aspectCatalog.json');
      const data = await res.json();
      aspectCatalog = data.aspects || {};
    } catch {
      aspectCatalog = {};
    }
  }

  function slugifyRef(ref, index) {
    const base = String(ref || 'source')
      .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-')
      .slice(0, 24)
      .toLowerCase();
    return `src-${base || 'item'}-${index}`;
  }

  function normalizeSources(sources = []) {
    const seen = new Set();
    return sources.map((src, i) => {
      if (typeof src === 'string') {
        const id = slugifyRef(src, i);
        return { id, type: 'literature', ref: src };
      }
      const id = src.id && !seen.has(src.id)
        ? src.id
        : slugifyRef(src.ref, i);
      seen.add(id);
      return { ...src, id };
    });
  }

  function dimensionsToAspects(dimensions, sourceIds) {
    const aspects = {};
    const defaultRef = sourceIds[0] ? [sourceIds[0]] : [];

    for (const [key, d] of Object.entries(dimensions || {})) {
      if (!d || d.confidence === 'speculative') continue;

      if (d.confidence === 'absent') {
        aspects[key] = {
          confidence: 'absent',
          note: d.note || d.summary || '证据不足，本快照不做判断',
        };
        continue;
      }

      const hasRefs = defaultRef.length > 0;
      let confidence = d.confidence || 'inferred';
      if (confidence === 'documented' && !hasRefs) confidence = 'inferred';

      aspects[key] = {
        confidence,
        summary: d.summary || '',
        sourceRefs: confidence === 'absent' ? [] : (d.sourceRefs || defaultRef),
        level: null,
        ...(d.note ? { note: d.note } : {}),
      };
    }
    return aspects;
  }

  function normalizeSnapshot(raw) {
    if (!raw) return null;

    const sources = normalizeSources(raw.sources || []);
    const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));

    let aspects = raw.aspects;
    if (!aspects && raw.dimensions) {
      aspects = dimensionsToAspects(raw.dimensions, sources.map((s) => s.id));
    }
    aspects = aspects || {};

    Object.entries(aspects).forEach(([key, asp]) => {
      if (asp.confidence === 'speculative') {
        delete aspects[key];
        return;
      }
      if (asp.confidence === 'documented' && (!asp.sourceRefs || !asp.sourceRefs.length)) {
        asp.confidence = 'inferred';
        asp.sourceRefs = sources.length ? [sources[0].id] : [];
        asp.note = [asp.note, '原标有据但缺少 sourceRefs，已降级为推断'].filter(Boolean).join('；');
      }
      if (asp.confidence === 'documented' && asp.sourceRefs?.length) {
        const refs = asp.sourceRefs.map((id) => sourceMap[id]).filter(Boolean);
        if (!refs.some(supportsDocumented)) {
          asp.confidence = 'inferred';
          asp.note = [asp.note, '无 A/B 级来源支撑，已降级为推断'].filter(Boolean).join('；');
        }
      }
      asp.sourceRefs = (asp.sourceRefs || []).filter((id) => sourceMap[id]);
    });

    return {
      ...raw,
      spatialScope: raw.spatialScope || raw.group || '待考证空间范围（请补充 spatialScope）',
      sources,
      aspects,
      _sourceMap: sourceMap,
    };
  }

  function getAspectLabel(id) {
    return aspectCatalog[id]?.label || id;
  }

  function getAspectEntries(snap) {
    const normalized = normalizeSnapshot(snap);
    if (!normalized) return { documented: [], inferred: [], absent: [] };

    const buckets = { documented: [], inferred: [], absent: [] };
    for (const [id, asp] of Object.entries(normalized.aspects)) {
      const conf = asp.confidence || 'absent';
      if (conf === 'speculative') continue;
      const entry = { id, label: getAspectLabel(id), ...asp };
      if (buckets[conf]) buckets[conf].push(entry);
      else buckets.inferred.push(entry);
    }
    return buckets;
  }

  function collectHypotheses(civData) {
    const items = [];
    const meta = civData.meta || {};

    (meta.hypotheses || []).forEach((h) => items.push(h));
    (meta.rejectedHypotheses || []).forEach((h) => items.push({
      ...h,
      status: h.status || 'rejected',
    }));

    (civData.snapshots || []).forEach((snap) => {
      (snap.rejectedHypotheses || []).forEach((h) => items.push({
        ...h,
        status: 'rejected',
        relatedSnapshots: [`${civData.meta?.countryId || 'unknown'}:${snap.year}`],
      }));
      if (snap.dimensions) {
        Object.entries(snap.dimensions).forEach(([id, d]) => {
          if (d.confidence === 'speculative') {
            items.push({
              id: `hyp-${snap.year}-${id}`,
              claim: d.summary,
              status: 'pending',
              relatedAspect: id,
              relatedSnapshots: [`${civData.meta?.countryId}:${snap.year}`],
            });
          }
        });
      }
    });

    return items;
  }

  function getResolvedSnap(civ, year, period, findNearest, isInRange) {
    if (!civ || !period) return { raw: null, snap: null, inRange: false };
    const raw = findNearest(civ.data.snapshots, year, period);
    const inRange = isInRange(raw, year);
    if (!inRange || !raw) return { raw, snap: null, inRange: false };
    return { raw, snap: normalizeSnapshot(raw), inRange: true };
  }

  function compareAspects(civSnaps) {
    const aspectIds = new Set();
    civSnaps.forEach(({ snap }) => {
      if (snap?.aspects) Object.keys(snap.aspects).forEach((id) => aspectIds.add(id));
    });

    return [...aspectIds].sort().map((aspectId) => ({
      id: aspectId,
      label: getAspectLabel(aspectId),
      entries: civSnaps.map(({ civ, snap, inRange }) => {
        if (!inRange || !snap) {
          return { civ, text: '该时段无快照', confidence: null, sourceRefs: [] };
        }
        const asp = snap.aspects[aspectId];
        if (!asp) {
          return { civ, text: '未检索 / 不在本条范围', confidence: null, sourceRefs: [] };
        }
        if (asp.confidence === 'absent') {
          return { civ, text: asp.note || '已检索，无证据', confidence: 'absent', sourceRefs: [] };
        }
        return {
          civ,
          text: asp.summary || '—',
          confidence: asp.confidence,
          sourceRefs: asp.sourceRefs || [],
          note: asp.note,
        };
      }),
    }));
  }

  return {
    CONFIDENCE_LABELS,
    SOURCE_TYPE_LABELS,
    GRADE_LABELS,
    RELATION_LABELS,
    supportsDocumented,
    loadCatalog,
    normalizeSnapshot,
    normalizeSources,
    getAspectLabel,
    getAspectEntries,
    collectHypotheses,
    getResolvedSnap,
    compareAspects,
  };
})();
