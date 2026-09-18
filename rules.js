/* =========================================================================
 * rules.js — 设计面板领域逻辑（纯函数）
 *
 * SQ.evaluateDesign(levelId, params) -> {
 *   credibility  0..100  实验可信度 / 机制可信度（占大部分分数）
 *   importance   0..100  机制重要性（仅第 6 关，单独一项）
 *   efficiency   0..100  实验效益（占小部分分数）
 *   timeCost     0..100  研究时间成本（过高参数折算，越低越好）
 *   moneyCost    0..100  研究经济成本（过高参数折算，越低越好）
 *   designScore  0..100  加权设计分
 *   metrics      [{label,value,unit,tone}]  供界面直接渲染
 *   pass         boolean 是否落在正确区间
 *   messages     [{tone,text}]
 * }
 * SQ.simulate(levelId, params) -> 结果对象 | null（第 6 关的模拟实验结果）
 * ========================================================================= */
(function (root) {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  const tone = (v, good, mid) => (v >= good ? 'good' : v >= mid ? 'mid' : 'bad');
  const M = (t, text) => ({ tone: t, text });
  const eff = (time, money) => clamp(100 - (0.5 * time + 0.5 * money), 0, 100);

  // 权重：默认「可信度 70% + 效益 30%」；第 6 关额外单列「机制重要性」
  const W_DEFAULT = { cred: 0.7, imp: 0, eff: 0.3 };
  const W_L6 = { cred: 0.5, imp: 0.2, eff: 0.3 };

  function pack(cred, importance, e, time, money, pass, messages, weights) {
    const w = weights || W_DEFAULT;
    const designScore = Math.round(w.cred * cred + w.imp * (importance || 0) + w.eff * e);

    const metrics = [{ label: '实验可信度', value: Math.round(cred), unit: '/100', tone: tone(cred, 85, 60) }];
    if (importance != null) metrics.push({ label: '机制重要性', value: Math.round(importance), unit: '/100', tone: tone(importance, 85, 60) });
    metrics.push({ label: '实验效益', value: Math.round(e), unit: '/100', tone: tone(e, 60, 35) });
    metrics.push({ label: '研究时间成本', value: Math.round(time), unit: '/100 越低越好', tone: tone(100 - time, 90, 60) });
    metrics.push({ label: '研究经济成本', value: Math.round(money), unit: '/100 越低越好', tone: tone(100 - money, 90, 60) });

    return {
      credibility: Math.round(cred),
      importance: importance == null ? null : Math.round(importance),
      efficiency: Math.round(e),
      timeCost: Math.round(time),
      moneyCost: Math.round(money),
      designScore, pass, messages, metrics
    };
  }

  /* ---------------- 第 1 关 · 发现关联 ---------------- */
  function l1(p) {
    const design = clamp(Math.round(num(p.design, 0)), 0, 2);
    const n = clamp(num(p.n, 200), 200, 20000);

    const credBase = [20, 60, 100][design];
    const powerF = n >= 3000 ? 1 : clamp(n / 3000, 0.15, 1);
    const cred = 0.7 * credBase + 0.3 * powerF * 100;

    const time = [8, 38, 70][design];
    const money = clamp(10 + (n / 20000) * 90, 0, 100);
    const e = eff(time, money);
    const pass = design === 2 && n >= 3000 && n <= 8000;

    const messages = [];
    if (pass) messages.push(M('good', '前瞻性队列明确了「暴露先于结局」，样本量落在统计效能与成本的平衡区间。'));
    if (design === 0) messages.push(M('warn', '横断面调查在同一时点同时测量感染与患病，无法确定谁先谁后，不能推断因果方向。'));
    if (design === 1) messages.push(M('warn', '病例对照研究依赖回顾性暴露史，回忆偏倚可能使效应估计失真。'));
    if (n < 3000) messages.push(M('warn', '样本量偏小，统计效能不足，可能无法稳定检出真实存在的关联。'));
    if (n > 8000) messages.push(M('warn', '样本量超出必要范围：统计效能已接近上限，随访成本与所需时间却仍在攀升。'));

    return pack(cred, null, e, time, money, pass, messages);
  }

  /* ---------------- 第 2 关 · 控制混杂 ---------------- */
  const TRUE_CONF = ['afla', 'alcohol', 'hcv'];
  const DISTRACT = ['smoke', 'stayup', 'tea', 'blood'];

  function l2(p) {
    const c = p.checks || {};
    const trueSel = TRUE_CONF.filter(k => c[k]).length;
    const medi = c.cirrhosis ? 1 : 0;
    const dist = DISTRACT.filter(k => c[k]).length;
    const over = medi + dist;
    const match = clamp(num(p.match, 0), 0, 100);

    const matchScore = match <= 95 ? match : Math.max(60, 100 - (match - 95) * 4);
    const confScore = (trueSel / 3) * 100;
    const overScore = clamp(100 - (medi * 45 + dist * 20), 0, 100);
    const cred = 0.6 * confScore + 0.25 * matchScore + 0.15 * overScore;

    const time = clamp(15 + over * 10, 0, 100);
    const money = clamp(12 + match * 0.55 + over * 9 + (match > 95 ? (match - 95) * 2 : 0), 0, 100);
    const e = eff(time, money);
    const pass = trueSel === 3 && over === 0 && match >= 70 && match <= 95;

    const messages = [];
    if (pass) messages.push(M('good', '三个真实混杂因素全部控制、避开了中介与无关变量，匹配精度也落在性价比最高的区间。'));
    if (!c.afla) messages.push(M('warn', '黄曲霉毒素 B1 与 HBV 协同致癌，是肝癌明确的独立危险因素——它是最不该漏掉的一个。'));
    if (!c.alcohol) messages.push(M('warn', '长期酒精摄入独立促进肝硬化与癌变，与 HBV 感染常在同一人群中并存。'));
    if (!c.hcv) messages.push(M('warn', '丙肝病毒与乙肝共享传播途径和高危人群，同样是肝癌病因，不控制会污染效应估计。'));
    if (c.cirrhosis) messages.push(M('warn', '肝硬化处在 HBV → 肝癌的因果通路上，属于中介变量。调整中介会人为削弱真实效应，是典型的过度控制偏倚。'));
    if (dist > 0) messages.push(M('warn', '你勾选了与「感染→肝癌」没有直接因果关联的变量。控制它们不会减少混杂，只会消耗样本量与经费。'));
    if (match < 70) messages.push(M('warn', '匹配精度偏低，混杂因素只被粗略平衡，残余混杂仍然偏高。'));
    if (match > 95) messages.push(M('warn', '匹配精度过高：边际收益很小，却显著推高时间与经济成本。'));

    return pack(cred, null, e, time, money, pass, messages);
  }

  /* ---------------- 第 3 关 · 剂量-反应 ---------------- */
  function l3(p) {
    const idx = clamp(Math.round(num(p.threshold, 0)), 0, 3);
    const fu = clamp(num(p.fu, 5), 5, 40);

    const pval = clamp(0.089 - (fu / 30) * 0.06, 0.001, 0.5);
    const thrScore = [100, 100, 90, 50][idx];
    const fuScore = fu >= 20 ? 100 : clamp((fu / 20) * 100, 0, 100);
    const sigScore = pval < 0.05 ? 100 : pval < 0.1 ? 60 : 20;
    const cred = 0.4 * thrScore + 0.4 * fuScore + 0.2 * sigScore;

    const time = clamp(((fu - 15) / 25) * 100, 0, 100);
    const money = clamp((fu - 10) * 3, 0, 100);
    const e = eff(time, money);
    const pass = idx <= 2 && fu >= 20 && fu <= 30;

    const messages = [];
    if (pass) messages.push(M('good', '切点覆盖了低病毒载量人群，随访长度又足以等到事件发生，趋势检验显著——剂量-反应关系成立。'));
    if (idx === 3) messages.push(M('warn', '切点设到 10⁶ 会忽略低病毒载量人群的风险，真实的剂量-反应关系可能被掩盖。'));
    if (fu < 20) messages.push(M('warn', '肝癌从感染到发病通常需要 20–30 年，随访不足会在事件发生前就收尾。'));
    if (fu > 30) messages.push(M('warn', '随访远超需要的年限：证据强度不再提升，时间与经济成本却继续增加。'));
    if (pval >= 0.05) messages.push(M('warn', '趋势检验未达显著（p ≥ 0.05），当前证据强度不足。'));

    return pack(cred, null, e, time, money, pass, messages);
  }

  /* ---------------- 第 4 关 · 干预验证 ---------------- */
  function l4(p) {
    const cov = clamp(num(p.coverage, 0), 0, 100);
    const fu = clamp(num(p.fu, 5), 5, 40);

    const covScore = cov <= 95 ? (cov >= 80 ? 100 : clamp((cov / 80) * 100, 0, 100)) : Math.max(70, 100 - (cov - 95) * 4);
    const fuScore = fu >= 20 ? 100 : clamp((fu / 20) * 100, 0, 100);
    const drop = (cov / 100) * (fu / 40) * 70;
    const effScore = clamp((drop / 70) * 100, 0, 100);
    const cred = 0.5 * covScore + 0.3 * fuScore + 0.2 * effScore;

    const time = clamp(((fu - 15) / 25) * 100, 0, 100);
    const money = clamp(cov * 0.8 + (cov > 95 ? (cov - 95) * 2 : 0), 0, 100);
    const e = eff(time, money);
    const pass = cov >= 80 && cov <= 95 && fu >= 20 && fu <= 30;

    const messages = [];
    if (pass) messages.push(M('good', '覆盖率足以形成人群免疫屏障，随访长度也足以等到肝癌终点上的差异。'));
    if (cov < 80) messages.push(M('warn', '接种覆盖率不足时人群免疫屏障无法建立，难以观察到发病率的显著下降。'));
    if (cov > 95) messages.push(M('warn', '覆盖率已接近饱和，再提高的边际收益极小，接种与组织成本却明显上升。'));
    if (fu < 20) messages.push(M('warn', '从接种到肝癌发病需要数十年，短期随访来不及验证干预效果。'));
    if (fu > 30) messages.push(M('warn', '随访已超过验证所需年限，证据强度不再提升而成本继续累积。'));

    return pack(cred, null, e, time, money, pass, messages);
  }

  /* ---------------- 第 5 关 · 机制补充 ---------------- */
  const METHODS = ['integration', 'mutation', 'immune'];
  const DIST_METHODS = ['hbv_dna', 'alt'];

  function l5(p) {
    const c = p.checks || {};
    const sel = METHODS.filter(k => c[k]).length;
    const dsel = DIST_METHODS.filter(k => c[k]).length;
    const depth = clamp(num(p.depth, 0), 0, 100);

    const methodScore = (sel / 3) * 100;
    const overScore = clamp(100 - dsel * 30, 0, 100);
    const depthScore = depth <= 90 ? clamp((depth / 70) * 100, 0, 100) : Math.max(70, 100 - (depth - 90) * 3);
    const cred = 0.7 * methodScore + 0.2 * depthScore + 0.1 * overScore;

    const time = clamp(15 + dsel * 15 + depth * 0.2, 0, 100);
    const money = clamp(10 + dsel * 12 + depth * 0.6 + sel * 10, 0, 100);
    const e = eff(time, money);
    const pass = sel === 3 && dsel === 0 && depth >= 70 && depth <= 90;

    const messages = [];
    if (pass) messages.push(M('good', '三条分子线索全部检测、深度落在性价比区间，机制证据与流行病学证据可以相互印证。'));
    if (!c.integration) messages.push(M('warn', 'HBV DNA 整合是病毒致癌的核心机制之一：插入可造成基因组不稳定并激活邻近原癌基因（如 TERT）。'));
    if (!c.mutation) messages.push(M('warn', '突变谱分析能区分病毒驱动突变与黄曲霉毒素等环境致癌物驱动的突变，是机制链的重要一环。'));
    if (!c.immune) messages.push(M('warn', '慢性感染导致的免疫微环境改变（T 细胞耗竭、Treg 浸润）是肝癌发生的重要促进因素。'));
    if (dsel > 0) messages.push(M('warn', '你选入了临床常规检测项目（血清病毒载量、肝功能）。它们对疾病管理有用，但看不出致癌的分子机制，还推高了成本。'));
    if (depth < 70) messages.push(M('warn', '检测深度不足时，低频整合与早期突变容易漏检。'));
    if (depth > 90) messages.push(M('warn', '检测深度超出所需：识别力提升有限，测序成本却显著上升。'));

    return pack(cred, null, e, time, money, pass, messages);
  }

  /* ---------------- 第 6 关 · 主动设计动物实验 ---------------- */
  const L6_MODEL_NAME = ['HBx 转基因小鼠', 'HBsAg 转基因小鼠', '土拨鼠（WHV 自然感染）', '复合模型（HBV 转基因 + 基因编辑）'];
  const MODEL_SCORE = [70, 45, 90, 100];
  const MODEL_TIME = [8, 8, 28, 14];
  const MODEL_MONEY = [26, 24, 38, 44];

  function l6(p) {
    const model = clamp(Math.round(num(p.model, 0)), 0, 3);
    const c = p.targets || {};
    const months = clamp(num(p.months, 12), 6, 24);
    const animals = clamp(num(p.animals, 20), 5, 60);

    const modelScore = MODEL_SCORE[model];
    const tScore = clamp(
      (c.trp53_ko ? 40 : 0) + (c.pten_ko ? 30 : 0) + (c.kras_on ? 20 : 0) + (c.hbx_oe ? 10 : 0)
      + (c.hbv_tert_ki ? 15 : 0) + (c.tert_inh ? 8 : 0)
      - (c.alb_ko ? 25 : 0) - (c.gfp ? 15 : 0), 0, 100);

    const rigor = clamp((animals - 5) / 25 * 100, 0, 100) * (months >= 12 ? 1 : clamp(months / 12, 0.4, 1));
    const credibility = 0.5 * modelScore + 0.3 * tScore + 0.2 * rigor;

    // 机制重要性：覆盖了几类致癌机制（病毒蛋白 / 抑癌基因失活 / 癌基因激活）
    const covered = ((c.hbx_oe || c.hbv_tert_ki) ? 1 : 0) + ((c.trp53_ko || c.pten_ko) ? 1 : 0) + (c.kras_on ? 1 : 0);
    const importance = clamp((covered / 3) * 85 + (model === 3 ? 15 : model === 2 ? 10 : 0), 0, 100);

    // 成本只看「操作了多少靶点」（含无关靶点），不随靶点得分回落
    const targetCount = ['trp53_ko', 'pten_ko', 'kras_on', 'hbx_oe', 'hbv_tert_ki', 'tert_inh', 'alb_ko', 'gfp'].filter(k => c[k]).length;
    const time = clamp((months / 24) * 70 + MODEL_TIME[model], 0, 100);
    const money = clamp(8 + MODEL_MONEY[model] * 0.8 + targetCount * 6 + animals * 0.6, 0, 100);
    const e = eff(time, money);

    const pass = (model === 3 || model === 2)
      && !!c.trp53_ko && !!c.pten_ko && !c.alb_ko && !c.gfp
      && months >= 12 && months <= 18
      && animals >= 15 && animals <= 30;

    const messages = [];
    if (pass) messages.push(M('good', '复合模型 + 抑癌基因双敲，复现了人类肝癌的「多步骤致癌」过程，随访与样本量也落在恰当区间。'));
    if (model === 0) messages.push(M('warn', '单向表达 HBx 单基因驱动的模型，致癌效率不高、潜伏期长，难以体现多步骤过程。'));
    if (model === 1) messages.push(M('warn', 'HBsAg 转基因的致癌作用较弱、争议较大，作为主模型说服力有限。'));
    if (!c.hbx_oe && !c.hbv_tert_ki && model !== 2) messages.push(M('warn', '没有保留病毒因素：缺少 HBV 蛋白表达或病毒整合，就谈不上「病毒如何促癌」。'));
    if (c.hbv_tert_ki) messages.push(M('good', '在 TERT 位点模拟 HBV 整合，正好对应第 5 关「整合位点集中于癌基因附近」的观察。'));
    if (c.tert_inh) messages.push(M('good', '抑制 TERT 是一条因果验证臂：若抑制后致癌效应减弱，就能把「整合/激活 → TERT」锁进通路。'));
    if (!c.trp53_ko || !c.pten_ko) messages.push(M('warn', '抑癌基因（Trp53 / Pten）失活是当代复合模型的主流策略，双敲比单敲显著加速 HCC，且肿瘤转录组更接近人 HCC。'));
    if (c.kras_on) messages.push(M('good', '叠加 KrasG12D 激活，可检验病毒蛋白与癌基因的协同效应。'));
    if (c.alb_ko) messages.push(M('warn', '白蛋白（Alb）敲除影响肝细胞基本功能，与致癌机制无关，属于无关靶点，只会干扰结论。'));
    if (c.gfp) messages.push(M('warn', 'GFP 只是荧光示踪标记，不改变机制，纳入实验分组会浪费样本与经费。'));
    if (months < 12) messages.push(M('warn', '随访不足 12 个月，多数品系尚未发展到可观察的 HCC。'));
    if (months > 18) messages.push(M('warn', '随访超过 18 个月后新增信息有限，饲养与检测成本却持续累积。'));
    if (animals < 15) messages.push(M('warn', '每组动物数偏少，HCC 发生率这一终点容易受个体差异影响。'));
    if (animals > 30) messages.push(M('warn', '每组动物数超出所需，统计精度提升有限而经济成本明显上升。'));

    return pack(credibility, importance, e, time, money, pass, messages, W_L6);
  }

  const RULES = { l1, l2, l3, l4, l5, l6 };

  /* ---------------- 第 6 关：模拟实验结果 ---------------- */
  function simulateL6(p) {
    const c = p.targets || {};
    const model = clamp(Math.round(num(p.model, 0)), 0, 3);
    const months = clamp(num(p.months, 12), 6, 24);

    const modelBias = [4, 1, 6, 9][model];
    const load = (c.trp53_ko ? 14 : 0) + (c.pten_ko ? 11 : 0) + (c.kras_on ? 13 : 0) + (c.hbx_oe ? 7 : 0);
    const frac = clamp(months / 24, 0.3, 1);
    const exp = clamp(Math.round((modelBias + load) * frac * 2.2), 0, 100);
    const ctrl = clamp(Math.round(frac * 2), 0, 3); // 同窝野生型对照组，背景发生率很低
    const median = exp >= 10 ? clamp(Math.round(20 - load * 0.2), 8, 24) + ' 月' : '未达到';

    return {
      kind: 'table',
      title: '模拟实验结果（HCC 发生率）',
      headers: ['分组', 'HCC 发生率', '中位发生月龄'],
      rows: [
        ['对照组（同窝野生型）', ctrl + '%', '未观察到'],
        ['实验组（按你的设计）', exp + '%', median]
      ],
      note: '模拟结果依据你选择的模型、靶点组合、随访月龄与样本量推算，用于比较不同设计对机制的说明力。'
    };
  }

  root.SQ = root.SQ || {};
  root.SQ.evaluateDesign = function (levelId, params) {
    const fn = RULES[levelId];
    if (!fn) throw new Error('未知关卡: ' + levelId);
    return fn(params || {});
  };
  root.SQ.simulate = function (levelId, params) {
    return levelId === 'l6' ? simulateL6(params || {}) : null;
  };
  root.SQ.tone = tone;
})(typeof window !== 'undefined' ? window : globalThis);
