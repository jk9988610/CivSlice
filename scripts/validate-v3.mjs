#!/usr/bin/env node
/**
 * v3 数据校验 — documented 须有 A/B 级 sourceRefs；禁止来源与 speculative
 * 用法：node scripts/validate-v3.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../site/data');

const FORBIDDEN_REF = /当代史学共识|学界公认|学术共识|无具体条目/;
const REQUIRED_SNAP_FIELDS = ['year', 'eraLabel', 'spatialScope', 'evidenceNote', 'sources', 'aspects'];

let errors = 0;

function err(msg) {
  console.error(`ERROR: ${msg}`);
  errors += 1;
}

function supportsDocumented(source) {
  return source && (source.grade === 'A' || source.grade === 'B');
}

function validateSnapshot(snap, countryId) {
  const label = `${countryId}:${snap.year}`;

  for (const field of REQUIRED_SNAP_FIELDS) {
    if (snap[field] === undefined || snap[field] === null) {
      err(`${label} 缺少必填字段 ${field}`);
    }
  }

  if (snap.dimensions) {
    err(`${label} 仍含旧 dimensions 字段`);
  }

  const sources = snap.sources || [];
  if (!sources.length) {
    err(`${label} sources[] 为空`);
  }

  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));

  for (const src of sources) {
    if (!src.id || !src.ref) err(`${label} 来源缺少 id 或 ref`);
    if (FORBIDDEN_REF.test(src.ref || '')) err(`${label} 含禁止来源：${src.ref}`);
    if (!src.grade) err(`${label} 来源 ${src.id} 缺少 grade`);
  }

  for (const [aspectId, asp] of Object.entries(snap.aspects || {})) {
    if (asp.confidence === 'speculative') {
      err(`${label} aspect ${aspectId} 含 speculative（应进假说库）`);
    }
    if (asp.confidence === 'documented') {
      if (!asp.sourceRefs?.length) {
        err(`${label} aspect ${aspectId} documented 但 sourceRefs 为空`);
      } else {
        const refs = asp.sourceRefs.map((id) => sourceMap[id]).filter(Boolean);
        if (!refs.some(supportsDocumented)) {
          err(`${label} aspect ${aspectId} documented 但无 A/B 级来源`);
        }
      }
    }
    if (asp.confidence === 'absent' && !asp.note) {
      err(`${label} aspect ${aspectId} absent 缺少 note（检索范围）`);
    }
    if (asp.level != null && asp.confidence === 'absent') {
      err(`${label} aspect ${aspectId} absent 不得有 level`);
    }
  }
}

function validateCiv(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const countryId = data.meta?.countryId || filePath.replace(/.*\//, '').replace('.json', '');

  if (data.dimensions) err(`${countryId} 顶层仍含 dimensions`);
  if (!data.meta?.methodology?.version) err(`${countryId} 缺少 methodology.version`);

  try {
    const bundles = JSON.parse(readFileSync(join(DATA_DIR, 'meta/comparisonBundles.json'), 'utf8'));
    if (!bundles.bundles || !Object.keys(bundles.bundles).length) {
      err('comparisonBundles.json 为空或格式错误');
    }
  } catch (e) {
    err(`无法读取 comparisonBundles.json: ${e.message}`);
  }

  (data.snapshots || []).forEach((s) => validateSnapshot(s, countryId));
}

const index = JSON.parse(readFileSync(join(DATA_DIR, 'civilizations.json'), 'utf8'));
index.civilizations.forEach(({ file }) => validateCiv(join(DATA_DIR, file)));

if (errors) {
  console.error(`\n${errors} error(s) found`);
  process.exit(1);
}

console.log('v3 validation passed');
