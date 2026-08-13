#!/usr/bin/env node
/**
 * 为 sources 标注 grade / relation，移除禁止来源，修正 documented 违规
 * 权威：Talk/docs/07-projects/2026-08-13-CivSlice-证据驱动数据标准.md §5.1
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../site/data');

const FORBIDDEN_REF = /当代史学共识|学界公认|学术共识|无具体条目|通史概括/;

function inferGradeRelation(src) {
  if (FORBIDDEN_REF.test(src.ref || '')) return null;

  const note = src.note || '';
  const ref = src.ref || '';

  if (src.type === 'archaeology') {
    return { grade: 'A', relation: 'contemporaneous' };
  }

  if (src.type === 'epigraphy' || /秦简|盟书|金文|汉简|纸草|铭文/.test(ref)) {
    return { grade: 'B', relation: 'contemporaneous' };
  }

  const laterPatterns = [
    '后世', '追述', '抄本', '李维', '《史记》', '《汉书》', '《宋史》',
    '《清实录》', '阿拉伯编年史', '教会编年史', '《中国考古学',
  ];
  if (laterPatterns.some((p) => ref.includes(p) || note.includes(p))) {
    return { grade: 'C', relation: 'later_retrospect' };
  }

  if (/波利比乌斯|希罗多德|《左传》|《论语》|《尚书》|侯马|居延|睡虎地|兵马俑|度量衡|马戛尔尼|清明上河图|敦煌|塔西佗|庞贝/.test(ref)) {
    const relation = /希罗多德|马戛尔尼|塔西佗/.test(ref) ? 'near_contemporaneous' : 'contemporaneous';
    return { grade: 'B', relation };
  }

  if (/人口普查|土地改革档案|档案/.test(ref)) {
    return { grade: 'B', relation: 'contemporaneous' };
  }

  if (/何炳棣/.test(ref)) {
    return { grade: 'D', relation: 'later_retrospect' };
  }

  if (src.type === 'literature') {
    return { grade: 'C', relation: 'later_retrospect' };
  }

  return { grade: 'D', relation: 'later_retrospect' };
}

function supportsDocumented(source) {
  return source && (source.grade === 'A' || source.grade === 'B');
}

function auditSnapshot(snap, countryId) {
  const removedIds = new Set();
  const sources = [];

  for (const src of snap.sources || []) {
    const meta = inferGradeRelation(src);
    if (!meta) {
      removedIds.add(src.id);
      continue;
    }
    sources.push({ ...src, ...meta });
  }

  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));
  const aspects = {};

  for (const [key, asp] of Object.entries(snap.aspects || {})) {
    const cleaned = { ...asp };
    cleaned.sourceRefs = (cleaned.sourceRefs || []).filter((id) => !removedIds.has(id) && sourceMap[id]);

    if (cleaned.confidence === 'documented') {
      const refs = cleaned.sourceRefs.map((id) => sourceMap[id]).filter(Boolean);
      if (!refs.some(supportsDocumented)) {
        cleaned.confidence = 'inferred';
        cleaned.note = [cleaned.note, '无 A/B 级来源支撑，已降级为推断'].filter(Boolean).join('；');
      }
    }

    if (cleaned.confidence !== 'absent' && !cleaned.sourceRefs.length && cleaned.confidence !== 'absent') {
      if (cleaned.confidence === 'documented') {
        cleaned.confidence = 'inferred';
        cleaned.note = [cleaned.note, 'sourceRefs 为空，已降级为推断'].filter(Boolean).join('；');
      }
    }

    aspects[key] = cleaned;
  }

  return { ...snap, sources, aspects };
}

function auditFile(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const countryId = data.meta?.countryId || filePath.replace(/.*\//, '').replace('.json', '');
  data.snapshots = data.snapshots.map((s) => auditSnapshot(s, countryId));
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Audited ${countryId}: ${data.snapshots.length} snapshots`);
}

const files = process.argv.slice(2);
const targets = files.length
  ? files.map((f) => join(DATA_DIR, f.endsWith('.json') ? f : `${f}.json`))
  : ['china', 'egypt', 'rome'].map((id) => join(DATA_DIR, `${id}.json`));

targets.forEach(auditFile);
