#!/usr/bin/env node
/**
 * 将文明 JSON 从 dimensions 格式迁移到 v3 aspects + sources[] 格式
 * 用法：node scripts/migrate-civ-v3.mjs [countryId...]
 * 示例：node scripts/migrate-civ-v3.mjs egypt rome
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../site/data');

const META_TITLES = {
  china: { title: '中国历史 · 证据驱动', subtitle: '以考古与 contemporaneous 文献为先的快照重建' },
  egypt: { title: '埃及历史 · 证据驱动', subtitle: '以考古与 contemporaneous 文献为先的快照重建' },
  rome: { title: '罗马历史 · 证据驱动', subtitle: '以考古与 contemporaneous 文献为先的快照重建' },
};

const V3_METHODOLOGY = {
  version: '3.0',
  principles: [
    '先写 sources[]，再写 aspects；禁止以 AI 通史记忆标 documented',
    '正式快照仅用 documented / inferred / absent；推测写入假说库',
    '不固定十维：有证据才建 aspect key；已检索无材料须显式 absent',
    'level 仅在有书面 rubric 时填写，否则省略或 null',
    'documented 须来自考古报告或 contemporaneous 文献/铭文（A/B 级）',
  ],
  confidenceLevels: {
    documented: '有据 — 考古实物或 contemporaneous 文献支持',
    inferred: '推断 — 基于相邻证据的合理推论，存在其他解释',
    absent: '未记录 — 已检索，证据不足，本快照不做判断',
  },
};

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
    const id = src.id && !seen.has(src.id) ? src.id : slugifyRef(src.ref, i);
    seen.add(id);
    const { id: _omit, ...rest } = src;
    return { id, ...rest };
  });
}

function migrateSnapshot(snap, countryId, hypotheses) {
  const sources = normalizeSources(snap.sources || []);
  const sourceIds = sources.map((s) => s.id);
  const defaultRef = sourceIds.length ? [sourceIds[0]] : [];
  const aspects = {};

  for (const [key, d] of Object.entries(snap.dimensions || snap.aspects || {})) {
    if (!d) continue;

    if (d.confidence === 'speculative') {
      hypotheses.push({
        id: `hyp-${snap.year}-${key}`,
        claim: d.summary || '',
        status: 'pending',
        relatedAspect: key,
        relatedSnapshots: [`${countryId}:${snap.year}`],
        note: '由 v3 迁移自 speculative 维度',
      });
      continue;
    }

    if (d.confidence === 'absent') {
      aspects[key] = {
        confidence: 'absent',
        note: d.note || d.summary || '证据不足，本快照不做判断',
      };
      continue;
    }

    let confidence = d.confidence || 'inferred';
    let sourceRefs = d.sourceRefs || (confidence === 'documented' ? sourceIds : defaultRef);
    if (confidence === 'documented' && !sourceRefs.length) {
      confidence = 'inferred';
      sourceRefs = defaultRef;
    }

    aspects[key] = {
      confidence,
      summary: d.summary || '',
      sourceRefs,
      level: null,
      ...(d.note ? { note: d.note } : {}),
    };
  }

  const {
    dimensions: _dims,
    _migrated,
    dynasty,
    group,
    periodId,
    eraTemplate,
    rejectedHypotheses,
    ...rest
  } = snap;

  if (rejectedHypotheses) {
    rejectedHypotheses.forEach((h) => {
      hypotheses.push({
        ...h,
        status: 'rejected',
        relatedSnapshots: [`${countryId}:${snap.year}`],
      });
    });
  }

  return {
    ...rest,
    spatialScope: snap.spatialScope || snap.group || snap.eraLabel,
    sources,
    aspects,
  };
}

function migrateFile(countryId) {
  const filePath = join(DATA_DIR, `${countryId}.json`);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const hypotheses = [...(data.meta.hypotheses || [])];

  (data.meta.rejectedHypotheses || []).forEach((h) => {
    hypotheses.push({ ...h, status: h.status || 'rejected' });
  });

  data.snapshots = data.snapshots.map((snap) => migrateSnapshot(snap, countryId, hypotheses));

  const labels = META_TITLES[countryId] || {
    title: `${data.meta.country || countryId} · 证据驱动`,
    subtitle: '以考古与 contemporaneous 文献为先的快照重建',
  };

  data.meta = {
    ...data.meta,
    ...labels,
    methodology: {
      ...(data.meta.methodology || {}),
      ...V3_METHODOLOGY,
    },
    hypotheses,
  };

  delete data.dimensions;
  delete data.confidenceLabels;
  delete data.meta.rejectedHypotheses;

  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${countryId}: migrated ${data.snapshots.length} snapshots, ${hypotheses.length} hypotheses`);
}

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Usage: node scripts/migrate-civ-v3.mjs <countryId> [...]');
  process.exit(1);
}

ids.forEach(migrateFile);
