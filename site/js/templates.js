/**
 * CivSlice 时代维度模板
 * 权威来源：Talk/docs/07-projects/2026-08-12-CivSlice-时代维度模板.md
 */
const CivTemplates = (() => {
  const CORE_DIMS = [
    { id: 'geography', label: '地理气候', short: '地理', rubric: '生存空间与地缘约束' },
    { id: 'subsistence', label: '生计来源', short: '生计', rubric: '获取食物与基本物资的方式' },
    { id: 'organization', label: '社会组织', short: '组织', rubric: '权力结构、分工与动员' },
    { id: 'knowledge', label: '知识技术', short: '知识', rubric: '工具、方法、信息记录' },
    { id: 'culture', label: '文化认同', short: '文化', rubric: '信仰、艺术、教育、身份' },
  ];

  const ERA_BOUNDARIES = [
    { id: 'paleolithic', maxYear: -10000 },
    { id: 'neolithic', maxYear: -4000 },
    { id: 'bronze', maxYear: -1000 },
    { id: 'iron_imperial', maxYear: 1500 },
    { id: 'early_modern', maxYear: 1800 },
    { id: 'industrial', maxYear: 1945 },
    { id: 'contemporary', maxYear: Infinity },
  ];

  const ERA_TEMPLATES = {
    paleolithic: {
      id: 'paleolithic',
      label: '石器时代',
      yearRange: [-Infinity, -10000],
      modules: [
        { id: 'mobility', label: '迁徙范围', short: '迁徙', rubric: '活动范围与季节性移动' },
        { id: 'toolkit', label: '石器工具', short: '石器', rubric: '打制石器与骨器谱系' },
        { id: 'foraging', label: '采集狩猎', short: '采集', rubric: '觅食效率与资源利用' },
        { id: 'band_cohesion', label: '群体协作', short: '群体', rubric: '群体规模与社会协作' },
      ],
    },
    neolithic: {
      id: 'neolithic',
      label: '新石器/早期农业',
      yearRange: [-10000, -4000],
      modules: [
        { id: 'agriculture', label: '农业驯化', short: '农业', rubric: '作物栽培与动物驯化' },
        { id: 'settlement', label: '定居聚落', short: '聚落', rubric: '村落规模与建筑' },
        { id: 'pottery', label: '陶器储存', short: '陶器', rubric: '陶器制作与储存技术' },
        { id: 'ritual', label: '祭祀墓葬', short: '祭祀', rubric: '墓葬仪式与信仰遗迹' },
      ],
    },
    bronze: {
      id: 'bronze',
      label: '青铜时代',
      yearRange: [-4000, -1000],
      modules: [
        { id: 'metallurgy', label: '青铜冶炼', short: '青铜', rubric: '青铜冶炼与应用' },
        { id: 'writing', label: '文字记录', short: '文字', rubric: '文字系统与记录' },
        { id: 'state_formation', label: '早期国家', short: '国家', rubric: '国家形态与权力集中' },
        { id: 'ritual_order', label: '礼制等级', short: '礼制', rubric: '礼制与等级秩序' },
        { id: 'trade', label: '区域交换', short: '交换', rubric: '贸易与物资流通' },
      ],
    },
    iron_imperial: {
      id: 'iron_imperial',
      label: '铁器与帝国',
      yearRange: [-1000, 1500],
      modules: [
        { id: 'iron_tech', label: '铁器工程', short: '铁器', rubric: '铁器冶炼与大型工程' },
        { id: 'bureaucracy', label: '官僚税制', short: '官僚', rubric: '官僚体系与税收' },
        { id: 'military', label: '军事力量', short: '军事', rubric: '战争能力与组织' },
        { id: 'commerce', label: '商业货币', short: '商业', rubric: '商业贸易与货币' },
        { id: 'historiography', label: '史学正统', short: '史学', rubric: '历史书写与正统观念' },
      ],
    },
    early_modern: {
      id: 'early_modern',
      label: '近代早期',
      yearRange: [1500, 1800],
      modules: [
        { id: 'firearms', label: '火器军事', short: '火器', rubric: '火器与军事革命' },
        { id: 'maritime', label: '航海殖民', short: '航海', rubric: '航海贸易与殖民' },
        { id: 'printing', label: '印刷传播', short: '印刷', rubric: '印刷与知识传播' },
        { id: 'fiscal_state', label: '财政国家', short: '财政', rubric: '财政汲取与国家能力' },
        { id: 'confession', label: '宗教意识', short: '宗教', rubric: '宗教改革与意识形态' },
      ],
    },
    industrial: {
      id: 'industrial',
      label: '工业时代',
      yearRange: [1800, 1945],
      modules: [
        { id: 'industry', label: '工业化', short: '工业', rubric: '机械化与工厂生产' },
        { id: 'infrastructure', label: '基础设施', short: '基建', rubric: '铁路、电报与基建' },
        { id: 'urbanization', label: '城市化', short: '城市', rubric: '城市规模与人口集中' },
        { id: 'public_health', label: '公共卫生', short: '公卫', rubric: '公共卫生与防疫' },
        { id: 'nationalism', label: '民族国家', short: '民族', rubric: '民族意识与国家建构' },
      ],
    },
    contemporary: {
      id: 'contemporary',
      label: '当代',
      yearRange: [1945, Infinity],
      modules: [
        { id: 'industrial_capacity', label: '工业科技', short: '产能', rubric: '工业与科技生产能力' },
        { id: 'education', label: '教育识字', short: '教育', rubric: '教育体系与识字率' },
        { id: 'healthcare', label: '医疗体系', short: '医疗', rubric: '现代医疗服务' },
        { id: 'information', label: '信息数字', short: '信息', rubric: '信息技术与数字化' },
        { id: 'global_integration', label: '全球参与', short: '全球', rubric: '全球化与国际参与' },
      ],
    },
  };

  /** 旧十维 → 新模板维度的映射规则（按模板） */
  const LEGACY_MAP = {
    bronze: {
      geography: 'geography',
      resources: 'subsistence',
      daily_life: 'subsistence',
      production: 'organization',
      politics: 'organization',
      technology: 'knowledge',
      culture: 'culture',
      technology_metal: 'metallurgy',
      politics_state: 'state_formation',
      culture_ritual: 'ritual_order',
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
      technology_iron: 'iron_tech',
      politics_bureau: 'bureaucracy',
      military: 'military',
      economy: 'commerce',
      historical_memory: 'historiography',
    },
    contemporary: {
      geography: 'geography',
      resources: 'subsistence',
      daily_life: 'subsistence',
      production: 'organization',
      politics: 'organization',
      technology: 'knowledge',
      culture: 'culture',
      technology_ind: 'industrial_capacity',
      daily_life_edu: 'education',
      daily_life_health: 'healthcare',
      technology_info: 'information',
      economy: 'global_integration',
    },
  };

  function inferTemplate(year) {
    for (const b of ERA_BOUNDARIES) {
      if (year <= b.maxYear) return b.id;
    }
    return 'contemporary';
  }

  function getTemplate(templateId) {
    return ERA_TEMPLATES[templateId] || ERA_TEMPLATES.iron_imperial;
  }

  function getTemplateAxes(templateId) {
    const tpl = getTemplate(templateId);
    return [...CORE_DIMS, ...tpl.modules];
  }

  function getDimensionMap(templateId) {
    const map = {};
    getTemplateAxes(templateId).forEach((d) => { map[d.id] = d.label; });
    return map;
  }

  function isLegacySnapshot(snapshot) {
    if (!snapshot.dimensions) return false;
    const keys = Object.keys(snapshot.dimensions);
    return keys.some((k) => ['resources', 'technology', 'production', 'economy', 'politics', 'daily_life', 'historical_memory'].includes(k));
  }

  function pickDim(...candidates) {
    return candidates.find((d) => d && d.confidence !== 'absent' && d.level != null) || candidates[0];
  }

  function mergeSummary(...parts) {
    return parts.filter(Boolean).join('；') || '—';
  }

  /** 将旧十维快照映射为当前时代模板维度 */
  function mapLegacyToTemplate(snapshot, templateId) {
    const old = snapshot.dimensions || {};
    const tpl = templateId || snapshot.eraTemplate || inferTemplate(snapshot.year);

    if (tpl === 'bronze') {
      return {
        geography: old.geography,
        subsistence: pickDim(old.daily_life, old.resources) || old.resources,
        organization: pickDim(old.politics, old.production) || old.production,
        knowledge: old.technology,
        culture: old.culture,
        metallurgy: old.technology ? { ...old.technology, summary: old.technology.summary } : undefined,
        writing: old.historical_memory?.confidence !== 'absent'
          ? { level: old.historical_memory.level, summary: old.historical_memory.summary, confidence: old.historical_memory.confidence, note: old.historical_memory.note }
          : { level: 1, summary: '无 contemporaneous 文字记录', confidence: 'documented' },
        state_formation: old.politics,
        ritual_order: old.culture,
        trade: old.economy,
      };
    }

    if (tpl === 'iron_imperial') {
      return {
        geography: old.geography,
        subsistence: pickDim(old.daily_life, old.resources),
        organization: pickDim(old.politics, old.production),
        knowledge: old.technology,
        culture: old.culture,
        iron_tech: old.technology,
        bureaucracy: old.politics,
        military: old.military,
        commerce: old.economy,
        historiography: old.historical_memory,
      };
    }

    if (tpl === 'early_modern') {
      return {
        geography: old.geography,
        subsistence: pickDim(old.daily_life, old.resources),
        organization: old.politics,
        knowledge: old.technology,
        culture: old.culture,
        firearms: old.military,
        maritime: old.economy,
        printing: old.technology,
        fiscal_state: old.politics,
        confession: old.culture,
      };
    }

    if (tpl === 'industrial') {
      return {
        geography: old.geography,
        subsistence: pickDim(old.daily_life, old.resources),
        organization: old.politics,
        knowledge: old.technology,
        culture: old.culture,
        industry: old.technology,
        infrastructure: old.technology,
        urbanization: old.production,
        public_health: old.daily_life,
        nationalism: old.culture,
      };
    }

    if (tpl === 'contemporary') {
      return {
        geography: old.geography,
        subsistence: pickDim(old.daily_life, old.resources),
        organization: old.politics,
        knowledge: old.technology,
        culture: old.culture,
        industrial_capacity: old.technology,
        education: old.culture,
        healthcare: old.daily_life,
        information: old.technology,
        global_integration: old.economy,
      };
    }

    // neolithic / paleolithic fallback from core only
    return {
      geography: old.geography,
      subsistence: pickDim(old.daily_life, old.resources, old.production),
      organization: old.politics,
      knowledge: old.technology,
      culture: old.culture,
    };
  }

  function cleanDimensions(raw, templateId) {
    const axes = getTemplateAxes(templateId);
    const validIds = new Set(axes.map((a) => a.id));
    const result = {};
    for (const [k, v] of Object.entries(raw || {})) {
      if (validIds.has(k) && v) result[k] = v;
    }
    return result;
  }

  /** 解析快照：确定 eraTemplate 并归一化 dimensions */
  function resolveSnapshot(snapshot) {
    const eraTemplate = snapshot.eraTemplate || inferTemplate(snapshot.year);
    let dimensions;

    if (snapshot._migrated || !isLegacySnapshot(snapshot)) {
      dimensions = cleanDimensions(snapshot.dimensions, eraTemplate);
    } else {
      dimensions = cleanDimensions(mapLegacyToTemplate(snapshot, eraTemplate), eraTemplate);
    }

    return {
      ...snapshot,
      eraTemplate,
      dimensions,
      _fromLegacy: isLegacySnapshot(snapshot) && !snapshot._migrated,
    };
  }

  function getSnapshotTemplate(snapshots, year, tolerance) {
    const snap = snapshots.reduce((best, s) =>
      Math.abs(s.year - year) < Math.abs(best.year - year) ? s : best
    );
    if (Math.abs(snap.year - year) > tolerance) return null;
    return resolveSnapshot(snap);
  }

  return {
    CORE_DIMS,
    ERA_TEMPLATES,
    ERA_BOUNDARIES,
    inferTemplate,
    getTemplate,
    getTemplateAxes,
    getDimensionMap,
    isLegacySnapshot,
    mapLegacyToTemplate,
    resolveSnapshot,
    getSnapshotTemplate,
  };
})();
