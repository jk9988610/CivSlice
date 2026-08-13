#!/usr/bin/env node
/**
 * 丰富 v3 文明数据：comparisonBundle、locator、legacy aspect 对齐比较束
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../site/data');

const ERA_BOUNDARIES = [
  { id: 'paleolithic', maxYear: -10000 },
  { id: 'neolithic', maxYear: -4000 },
  { id: 'bronze', maxYear: -1000 },
  { id: 'iron_imperial', maxYear: 1500 },
  { id: 'early_modern', maxYear: 1800 },
  { id: 'industrial', maxYear: 1945 },
  { id: 'contemporary', maxYear: Infinity },
];

const LEGACY_TO_BUNDLE = {
  bronze: {
    geography: 'geography',
    resources: 'subsistence',
    daily_life: 'subsistence',
    production: 'organization',
    politics: 'organization',
    technology: 'knowledge',
    culture: 'culture',
    economy: 'trade',
    historical_memory: 'writing',
  },
  iron_imperial: {
    geography: 'geography',
    resources: 'subsistence',
    daily_life: 'subsistence',
    production: 'organization',
    politics: 'organization',
    technology: 'knowledge',
    culture: 'culture',
    economy: 'commerce',
    historical_memory: 'historiography',
    military: 'military',
  },
  early_modern: {
    geography: 'geography',
    resources: 'subsistence',
    daily_life: 'subsistence',
    production: 'organization',
    politics: 'organization',
    technology: 'knowledge',
    culture: 'culture',
    economy: 'maritime',
    military: 'firearms',
    historical_memory: 'culture',
  },
  industrial: {
    geography: 'geography',
    resources: 'subsistence',
    daily_life: 'subsistence',
    production: 'organization',
    politics: 'organization',
    technology: 'knowledge',
    culture: 'culture',
    economy: 'industry',
    military: 'nationalism',
    historical_memory: 'culture',
  },
  contemporary: {
    geography: 'geography',
    resources: 'subsistence',
    daily_life: 'subsistence',
    production: 'organization',
    politics: 'organization',
    technology: 'knowledge',
    culture: 'culture',
    economy: 'global_integration',
    industrial_capacity: 'industrial_capacity',
    education: 'education',
    healthcare: 'healthcare',
    information: 'information',
    global_integration: 'global_integration',
  },
};

const CONF_RANK = { documented: 3, inferred: 2, absent: 1 };

function inferBundle(year) {
  for (const b of ERA_BOUNDARIES) {
    if (year <= b.maxYear) return b.id;
  }
  return 'contemporary';
}

function inferLocator(src) {
  if (src.locator) return src.locator;
  const ref = src.ref || '';
  const locators = [
    [/李维.*罗马史/, 'Perseus Digital Library · Livy, Ab Urbe Condita'],
    [/波利比乌斯/, 'Perseus Digital Library · Polybius, Histories'],
    [/塔西佗/, 'LacusCurtius · Tacitus, Annals'],
    [/希罗多德/, 'Perseus Digital Library · Herodotus, Histories'],
    [/纸草|托勒密/, 'Trismegistos / papyri.info'],
    [/罗马广场|庞贝|意大利半岛考古|罗马道路/, '意大利考古遗产门户 / 遗址报告（待补编号）'],
    [/阿拉伯编年史/, '阿拉伯编年史点校本（待补卷次）'],
    [/教会编年史/, '中世纪教会编年史版本（待补卷次）'],
    [/中王国墓葬|萨卡拉|亚历山大城|开罗法蒂玛|罗马时期埃及/, '埃及考古报告 / EES 出版物（待补页码）'],
    [/《左传》/, 'ctext.org · 左传'],
    [/《论语》/, 'ctext.org · 论语'],
    [/殷周金文|侯马盟书|睡虎地|居延汉简/, '出土文献图录 / 释文（待补编号）'],
    [/二里头/, '《二里头遗址发掘报告》等考古简报'],
    [/兵马俑|丰镐/, '陕西省考古研究所发掘报告'],
  ];
  for (const [re, loc] of locators) {
    if (re.test(ref)) return loc;
  }
  if (src.type === 'archaeology') return '考古发掘简报 / 遗址报告（待补编号与页码）';
  return undefined;
}

function supportsDocumented(source) {
  return source && (source.grade === 'A' || source.grade === 'B');
}

function mergeAspect(a, b) {
  if (!a) return { ...b };
  const pickA = (CONF_RANK[a.confidence] || 0) >= (CONF_RANK[b.confidence] || 0);
  const primary = pickA ? a : b;
  const secondary = pickA ? b : a;
  return {
    confidence: primary.confidence,
    summary: primary.summary || secondary.summary,
    sourceRefs: [...new Set([...(a.sourceRefs || []), ...(b.sourceRefs || [])])],
    level: null,
    ...(a.note || b.note ? { note: [a.note, b.note].filter(Boolean).join('；') } : {}),
  };
}

function alignAspects(aspects, bundleId) {
  const map = LEGACY_TO_BUNDLE[bundleId];
  if (!map) return aspects;

  const mappedKeys = new Set(Object.keys(map));
  const out = {};

  for (const [key, asp] of Object.entries(aspects || {})) {
    const target = map[key];
    if (target) {
      out[target] = mergeAspect(out[target], asp);
    } else if (![...mappedKeys].includes(key)) {
      out[key] = asp;
    }
  }
  return out;
}

function tightenSourceRefs(asp, sourceMap) {
  if (asp.confidence !== 'documented' || !asp.sourceRefs?.length) return asp;
  const abRefs = asp.sourceRefs.filter((id) => supportsDocumented(sourceMap[id]));
  if (abRefs.length) return { ...asp, sourceRefs: abRefs };
  return asp;
}

function enrichSnapshot(snap) {
  const bundleId = snap.comparisonBundle || inferBundle(snap.year);
  let sources = (snap.sources || []).map((src) => {
    const locator = inferLocator(src);
    return locator ? { ...src, locator } : src;
  });

  const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s]));
  let aspects = alignAspects(snap.aspects, bundleId);

  aspects = Object.fromEntries(
    Object.entries(aspects).map(([k, asp]) => [k, tightenSourceRefs(asp, sourceMap)])
  );

  return {
    ...snap,
    comparisonBundle: bundleId,
    sources,
    aspects,
  };
}

function enrichFile(filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  data.snapshots = data.snapshots.map(enrichSnapshot);
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Enriched ${data.meta?.countryId || filePath}: ${data.snapshots.length} snapshots`);
}

const ids = process.argv.slice(2);
const targets = (ids.length ? ids : ['china', 'egypt', 'rome']).map((id) =>
  join(DATA_DIR, `${id.replace('.json', '')}.json`)
);
targets.forEach(enrichFile);
