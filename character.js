/* =========================================================================
 * character.js — 关卡页左侧的动漫角色
 *
 * 图层拆分：
 *   1) 头发 = hair-back（最后面，以后会摇摆） + hair-mid（基底头发，不动）
 *           + hair-front-1/2/3（三条前刘海）
 *   2) 脸   = face-base（脸打底）+ face-<表情>-open / -blink（五官）
 *   3) 手臂 = 「肩 → 肘 → 腕」三级嵌套
 *        .arm-wrap(右臂整棵镜像) > .arm(绕肩) > .seg(绕肘) > .hand(绕腕)
 *        大臂/小臂各 1 张图、左右共用；手型单独出图；姿态只是角度（见 ARM_POSES）
 *   4) 情绪小气泡 bubble-<表情>（平静无）
 *
 * 所有部件都是「同一张画布」1000×1400 的透明 PNG，叠放时天然对齐。
 * 锚点（实测自 lihui 的图）：肩 39.70%/56.43% · 肘 39.80%/66.79% · 腕 40.00%/71.79%
 *       左臂是原始朝向，右臂 = 左臂整棵 scaleX(-1) 镜像（角度取反）。
 *
 * 文件不存在时自动退回几何占位图形 / 手型退回 hand-relaxed。
 * ========================================================================= */
(function (root) {
  'use strict';
  root.SQ = root.SQ || {};

  const BASE = 'assets/character/';
  const POSE_KEY = 'causal-lab-puppet-v1';
  const DEFAULT_POSE = { x: 3, y: 24, scale: 100 };
  const BASE_WIDTH = 220; // px，scale=100 时角色占位宽度

  const EXPRESSIONS = ['idle', 'warn-cred', 'warn-cost', 'warn-both', 'pass', 'fail'];

  /* ---------------- 非手臂图层（z 越大越靠前） ----------------
   * files: 候选文件，按顺序尝试，第一个存在的生效（{s} 会被替换成表情名）
   * blink: 眨眼差分（仅五官层用） / ph: 无图时的几何占位类 / transient: 短暂出现
   */
  const LAYERS = [
    { id: 'hair-back', z: 10, ph: 'hair-back', files: ['hair-back.png'] },

    { id: 'body', z: 30, ph: 'body', files: ['body.png'] },

    { id: 'face-base', z: 50, ph: 'face-base', files: ['face-base.png'] },

    /* 中发（基底头发）压在脸上面，前发再压在中发上 */
    { id: 'hair-mid', z: 55, ph: 'hair-mid', files: ['hair-mid.png'] },

    { id: 'hair-front-1', z: 60, ph: 'hair-front', files: ['hair-front-1.png', 'hair-front.png'] },
    { id: 'hair-front-2', z: 61, ph: 'hair-front', files: ['hair-front-2.png', 'hair-front.png'] },
    { id: 'hair-front-3', z: 62, ph: 'hair-front', files: ['hair-front-3.png', 'hair-front.png'] },

    /* 五官/表情压在所有头发之上，仅低于「举到脸旁的手臂」（z 65） */
    { id: 'face-feat', z: 63, ph: 'face-feat', files: ['face-{s}-open.png', 'face-{s}.png'], blink: 'face-{s}-blink.png' },

    { id: 'bubble-face', z: 70, ph: '', files: ['bubble-{s}.png'], transient: true }
  ];

  /* ---------------- 手臂绑定：肩 → 肘 → 腕 ----------------
   * z：18 = 藏在身体后（双手背后）· 36 = 左臂（身体前，压右臂之下）
   *     38 = 右臂（身体前）· 65 = 手举到脸/头旁边（要压过前发）
   */
  const ARM_Z = { L: 36, R: 38 };
  const ARM_ANCHORS = {            // 左右共用这一套（左臂原始朝向；右臂整棵镜像）
    shoulder: '39.70% 56.43%',
    elbow: '39.80% 66.79%',
    wrist: '40.00% 71.79%'
  };
  const ARM_FILES = { upper: 'arm-upper.png', fore: 'arm-fore.png' };
  const HAND_FALLBACK = 'hand-relaxed.png';
  /* 可省略的手型：没有独立图时用哪个顶（缺图自动回退，不会开天窗） */
  const HAND_ALIAS = { cross: 'relaxed', hip: 'relaxed' };
  /* 眨眼差分共用：这三个「为难」表情共用一张 face-warn-blink.png */
  const SHARED_BLINK = 'face-warn-blink.png';
  const SHARED_BLINK_FOR = ['warn-cred', 'warn-cost', 'warn-both'];

  /* 情绪气泡的额外变换（按表情各一份）：轴心在气泡自身中心 */
  const BUBBLE_ORIGIN = '17% 10%';
  const BUBBLES = {
    'warn-cred': { dx: 0, dy: 0, s: 156, r: 2 },
    'warn-cost': { dx: -78, dy: 0, s: 126, r: 0 },
    'warn-both': { dx: 0, dy: 0, s: 100, r: 0 },
    pass: { dx: -36, dy: -32, s: 155, r: -2 },
    fail: { dx: -80, dy: -80, s: 117, r: 0 }
  };

  /* 每个部件的旋转轴心（相对画布百分比）——非手臂部分 */
  const ANCHORS = {
    'hair-back': '50% 30%',
    'hair-mid': '50% 22%',
    'hair-front-1': '34% 26%', 'hair-front-2': '50% 24%', 'hair-front-3': '66% 26%',
    'body': '50% 100%',
    'face-base': '50% 22%', 'face-feat': '50% 22%'
  };

  /* ---------------- 姿态表 ----------------
   * 角度约定 α：0° = 指向正下方，正值 = 顺时针（朝屏幕右侧）。左臂「向外」是负值。
   * a1 大臂绝对角 · a2 小臂绝对角 · tilt 手相对小臂的偏角 · hand 手型
   * dy 肩点上下偏移(px) · z 图层 z 序（可覆盖默认）
   * 右臂存的是「屏幕角的相反数」（因为它整棵是镜像的）。
   * 数值来自 姿态调参台.html，改了这里就能换姿势。
   */
  const P = (a1, a2, hand, o) => Object.assign({ a1: a1, a2: a2, tilt: 0, hand: hand || 'relaxed' }, o || {});
  const ARM_POSES = {
    idle: [
      { id: 'idle-1', L: P(2, -4), R: P(-3, 0) },
      { id: 'idle-2', L: P(-27, -114, 'relaxed', { tilt: -33, dy: 3 }),
        R: P(21, -200, 'relaxed', { tilt: -10, dx: -6, dy: -12, hx: 8, hs: 94 }) },
      { id: 'idle-3', L: P(10, 0, 'relaxed', { tilt: 22 }),
        R: P(-107, -119, 'open', { tilt: 145, dx: -38, dy: 4, hx: 12, hy: 80, hs: 124, z: 65 }) }
    ],
    'warn-cred': [
      { id: 'warn-cred', L: P(-11, -117, 'open', { dy: -9, z: 36 }),
        R: P(30, 100, 'thumb', { tilt: 113, dx: 7, dy: -20, hx: 41, hy: 53, hs: 119, z: 38 }) }
    ],
    'warn-cost': [
      { id: 'warn-cost', L: P(25, -8, 'count', { tilt: 11, dx: 43, dy: -34, z: 65 }),
        R: P(-17, -21, 'open', { tilt: 163, dx: -27, dy: -18, hx: -10, hy: 69, hs: 111, z: 38 }) }
    ],
    'warn-both': [
      { id: 'warn-both', L: P(22, -58, 'relaxed', { dx: 20, dy: -13, z: 36 }),
        R: P(-8, 50, 'relaxed', { tilt: -20, dx: -17, dy: -22, hx: 7, hy: -12, z: 38 }) }
    ],
    pass: [
      { id: 'pass-1', L: P(128, 159, 'thumb', { tilt: -114, dx: 15, dy: 27, hx: -41, hy: 68, hs: 157, z: 65 }),
        R: P(-123, -135, 'open', { tilt: -180, dx: -32, dy: 26, hx: -13, hy: 69, hs: 125, z: 65 }) },
      { id: 'pass-2', L: P(118, 136, 'open', { tilt: 177, dx: 31, dy: 18, hx: 15, hy: 70, hs: 125, z: 65 }),
        R: P(-118, -136, 'open', { tilt: 178, dx: -38, dy: 27, hx: -19, hy: 80, hs: 123, z: 65 }) }
    ],
    fail: [
      { id: 'fail-1', L: P(-2, -27, 'relaxed', { tilt: -1, z: 20 }), R: P(1, 27, 'relaxed', { z: 20 }) },
      { id: 'fail-2', L: P(7.8, 146.9, 'open', { tilt: -180, dy: -23, hx: 15, hy: 77, hs: 125, z: 36 }),
        R: P(-7.8, -146.9, 'open', { tilt: -180, dx: -18, dy: -19, hx: -22, hy: 74, hs: 119, z: 38 }) }
    ]
  };
  /* 姿态中文名（对应调参台导出的名字） */
  const POSE_NAMES = {
    'idle-1': '垂手待机', 'idle-2': '手搭胸前', 'idle-3': '摆手·右手脸旁轻摆',
    'warn-cred': '双手半臂交叠', 'warn-cost': '抬手+算账·左臂举到头旁',
    'warn-both': '叉腰·双手扶胯·肘外张',
    'pass-1': '竖大拇指+开掌·左手脸旁点赞', 'pass-2': '双手挥舞·双臂举高',
    'fail-1': '双手背后·手藏到身后', 'fail-2': '耸肩·双臂摊开掌心向上'
  };
  const VARIANT_MS = 13000; // 同一表情下多个变体的轮换间隔（放慢一点，更自然）

  /* 情绪气泡文字：随机抽一句（每类多备几句） */
  const BUBBLE_TEXT = {
    idle: [],
    'warn-cred': [
      '这个设计……证据够稳吗？',
      '样本和目标人群，是不是还差一点？',
      '混杂真的控住了吗？我有点不放心。',
      '这条关联，能往因果上靠吗？',
      '再想想，是不是漏了什么变量？'
    ],
    'warn-cost': [
      '时间或者经费，有点撑不住了。',
      '随访这么久，钱和人扛得住吗？',
      '成本曲线开始压过收益了。',
      '这笔投入，真的值吗？',
      '再往上加，边际收益还剩多少？'
    ],
    'warn-both': [
      '证据和成本，两边都差一口气。',
      '可信度不够，代价又太高……',
      '这一版两头都悬着。',
      '又要更稳、又要更省，难。',
      '再调一调吧，现在哪边都不讨好。'
    ],
    pass: [
      '这一版，站得住。',
      '证据和成本，平衡得不错。',
      '可以，往下走吧。',
      '这个设计，我放心。',
      '挺好，继续保持。'
    ],
    fail: [
      '再想想，还差一点儿。',
      '离达标区间还差一截。',
      '这个方向不太对，换个思路？',
      '别急，调一调再来一次。',
      '嗯……还不太行。'
    ]
  };

  /* ---------------- 几何占位：五官（拆脸后只画五官） ---------------- */
  const FEATURES = {
    idle: `
      <circle cx="72" cy="98" r="9" fill="currentColor"/>
      <circle cx="128" cy="98" r="9" fill="currentColor"/>
      <rect x="88" y="140" width="24" height="6" rx="3" fill="currentColor"/>`,
    'warn-cred': `
      <rect x="56" y="72" width="30" height="6" rx="3" fill="currentColor" transform="rotate(15 71 75)"/>
      <rect x="114" y="72" width="30" height="6" rx="3" fill="currentColor" transform="rotate(-15 129 75)"/>
      <circle cx="72" cy="104" r="9" fill="currentColor"/>
      <circle cx="128" cy="104" r="9" fill="currentColor"/>
      <rect x="90" y="148" width="20" height="6" rx="3" fill="currentColor"/>`,
    'warn-cost': `
      <path d="M58 110 q14 -16 28 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M114 110 q14 -16 28 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M82 150 q10 -11 18 0 q8 11 18 0" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M158 62 q11 15 0 24 q-11 9 -2 -7 z" fill="currentColor" opacity=".65"/>`,
    'warn-both': `
      <path d="M58 106 q14 -13 28 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <circle cx="128" cy="104" r="9" fill="currentColor"/>
      <path d="M84 152 q12 13 22 -2 q6 -9 12 2" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M44 62 q11 15 0 24 q-11 9 -2 -7 z" fill="currentColor" opacity=".65"/>
      <path d="M166 70 q11 15 0 24 q-11 9 -2 -7 z" fill="currentColor" opacity=".65"/>`,
    pass: `
      <path d="M58 106 q14 -17 28 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M114 106 q14 -17 28 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M80 138 q20 23 40 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>`,
    fail: `
      <path d="M58 90 q14 15 28 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M114 90 q14 15 28 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M84 152 q16 -17 32 0" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M150 116 q9 17 -2 23 q-9 4 -4 -9 z" fill="currentColor" opacity=".65"/>`
  };
  const featuresSVG = state =>
    `<div class="ph ph-face-feat"><svg viewBox="0 0 200 200" aria-hidden="true">${FEATURES[state] || FEATURES.idle}</svg></div>`;

  /* ---------------- 文件探测（带缓存，避免重复请求） ---------------- */
  const probeCache = new Map();
  function probe(url) {
    if (probeCache.has(url)) return Promise.resolve(probeCache.get(url) ? url : null);
    return new Promise(resolve => {
      const im = new Image();
      im.onload = () => { probeCache.set(url, true); resolve(url); };
      im.onerror = () => { probeCache.set(url, false); resolve(null); };
      im.src = url;
    });
  }
  async function firstAvailable(urls) {
    for (const u of urls) { if (await probe(u)) return u; }
    return null;
  }
  const fill = (tpl, state) => tpl.replace('{s}', state);

  /* ---------------- 姿态存取 ---------------- */
  function loadPose() {
    try {
      const raw = JSON.parse(localStorage.getItem(POSE_KEY) || '{}');
      if (raw && typeof raw.x === 'number') return Object.assign({}, DEFAULT_POSE, raw);
    } catch (e) {}
    const w = (typeof window !== 'undefined') ? window.innerWidth : 1400;
    if (w < 760) return { x: 0, y: 50, scale: 55 };
    if (w < 1180) return { x: 0, y: 28, scale: 72 };
    return Object.assign({}, DEFAULT_POSE);
  }
  function savePose(p) {
    try { localStorage.setItem(POSE_KEY, JSON.stringify(p)); } catch (e) {}
  }

  /* 兼容旧调用（行内 onload/onerror 用得到，这里保留导出） */
  function artLoaded(img) { const l = img && img.closest('.layer'); if (l) l.classList.add('has-art'); }
  function artFailed(img) { if (img && img.parentNode) img.parentNode.removeChild(img); }

  /* ---------------- 挂载 ---------------- */
  function mount(host, opts) {
    if (!host) return null;
    opts = opts || {};
    let pose = loadPose();
    let state = 'idle';
    let variantIdx = 0;
    let token = 0;
    let blinkTimer = null;
    let bubbleTimer = null;
    let variantTimer = null;

    const armWrapHTML = side => `
      <div class="arm-wrap arm-${side} ${side === 'L' ? 'is-left' : 'is-right'}" data-side="${side}" style="z-index:${ARM_Z[side]}">
        <div class="arm" data-part="arm-upper">
          <div class="sway" data-part="sway">
            <div class="ph ph-arm-upper"></div>
            <img class="art" alt="">
            <div class="seg" data-part="arm-fore">
              <div class="ph ph-arm-fore"></div>
              <img class="art" alt="">
              <div class="hand" data-part="hand">
                <div class="ph ph-hand"></div>
                <img class="art" alt="">
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const layerHTML = LAYERS.map(p => `
      <div class="layer layer-${p.id}" data-part="${p.id}" style="z-index:${p.z};transform-origin:${ANCHORS[p.id] || '50% 50%'}">
        ${p.ph ? `<div class="ph ph-${p.ph}"></div>` : ''}
        ${p.id === 'face-feat' ? featuresSVG('idle') : ''}
        <img class="art" alt="">
      </div>`).join('');

    host.innerHTML = `
      <div class="puppet" id="puppet">
        <div class="puppet-stage" id="puppetStage" role="img" aria-label="随设计变化表情的研究伙伴">
          ${armWrapHTML('L')}
          ${armWrapHTML('R')}
          ${layerHTML}
        </div>
        <div class="puppet-bubble" id="puppetBubble"></div>
      </div>

      <div class="puppet-ctl" id="puppetCtl">
        <button type="button" class="ctl-btn" id="ctlToggle" aria-expanded="false" aria-label="调整角色的位置与大小">⚙</button>
        <div class="ctl-panel" id="ctlPanel" hidden>
          <div class="ctl-row"><span>左右</span><input type="range" id="poseX" min="-5" max="75" step="1" aria-label="左右位置"><b id="poseXv"></b></div>
          <div class="ctl-row"><span>上下</span><input type="range" id="poseY" min="-5" max="80" step="1" aria-label="上下位置"><b id="poseYv"></b></div>
          <div class="ctl-row"><span>大小</span><input type="range" id="poseS" min="40" max="240" step="5" aria-label="大小"><b id="poseSv"></b></div>
          <button type="button" class="ctl-reset" id="poseReset">恢复默认</button>
          <p class="ctl-tip">也可以直接拖动角色移动位置</p>
        </div>
      </div>`;

    const el = host.querySelector('#puppet');
    const stage = host.querySelector('#puppetStage');
    const bubble = host.querySelector('#puppetBubble');
    const layerEl = id => host.querySelector('.layer-' + id);
    const setSegArt = (node, url) => {
      if (!node) return;
      const img = node.querySelector('.art');
      if (!img) return;
      if (url) { img.src = url; node.classList.add('has-art'); }
      else { img.removeAttribute('src'); node.classList.remove('has-art'); }
    };

    /* ---------- 手臂：写角度 + 换手型 ---------- */
    const appliedTilt = { L: 0, R: 0 };   // 记录上一次实际写入的手旋转角（用于抄最近路径）
    const armNode = (side, part) =>
      host.querySelector('.arm-wrap.arm-' + side + (part === 'arm' ? ' > .arm' : ' .' + part));

    function applyArm(side, a) {
      const wrap = host.querySelector('.arm-wrap.arm-' + side);
      if (!wrap || !a) return;
      const sgn = side === 'L' ? 1 : -1;      // 右臂整棵镜像 → 角度/位移都取反
      const dx = a.dx ? (sgn * a.dx / 10).toFixed(3) + '%' : '0';   // px → 画布宽度百分比
      const dy = a.dy ? (a.dy / 14).toFixed(3) + '%' : '0';         // px → 画布高度百分比
      const hx = a.hx ? (sgn * a.hx / 10).toFixed(3) + '%' : '0';
      const hy = a.hy ? (a.hy / 14).toFixed(3) + '%' : '0';
      const hs = ((a.hs == null ? 100 : a.hs) / 100).toFixed(3);
      wrap.style.zIndex = (a.z || ARM_Z[side]);
      armNode(side, 'arm').style.transform = `translate(${dx}, ${dy}) rotate(${(sgn * a.a1).toFixed(2)}deg)`;
      armNode(side, 'seg').style.transform = `rotate(${(sgn * (a.a2 - a.a1)).toFixed(2)}deg)`;
      /* 手腕旋转：取与上一次最近的等价角（相差 ±360 度是同一个朝向），
         避免切姿态时手掌绕手腕反方向空转一大圈、看着像脱开了手腕 */
      let tilt = a.tilt || 0;
      const prevTilt = appliedTilt[side] || 0;
      while (tilt - prevTilt > 180) tilt -= 360;
      while (tilt - prevTilt < -180) tilt += 360;
      appliedTilt[side] = tilt;
      const handE = armNode(side, 'hand');
      handE.style.transform = `translate(${hx}, ${hy}) rotate(${(sgn * tilt).toFixed(2)}deg) scale(${hs})`;
      // 手型图按需加载；缺图时按别名/默认回退（不会开天窗）
      if (handE.dataset.want !== a.hand) {
        handE.dataset.want = a.hand;
        const cands = [BASE + 'hand-' + a.hand + '.png'];
        const alias = HAND_ALIAS[a.hand];
        if (alias) cands.push(BASE + 'hand-' + alias + '.png');
        cands.push(BASE + HAND_FALLBACK);
        firstAvailable(cands).then(url => {
          if (handE.dataset.want === a.hand) setSegArt(handE, url);
        });
      }
    }
    function applyPose(pose) { applyArm('L', pose.L); applyArm('R', pose.R); }

    /* ---------- 情绪气泡：图 + 文字提醒，时不时自己冒出来 ---------- */
    let bubbleUrl = null, bubbleArtTimer = null, bubbleTextTimer = null, bubbleLoop = null;
    const pickText = s => {
      const arr = BUBBLE_TEXT[s] || [];
      return arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
    };
    function showBubble() {
      const text = pickText(state);
      if (text) {
        bubble.textContent = text;
        bubble.classList.add('show');
        clearTimeout(bubbleTextTimer);
        bubbleTextTimer = setTimeout(() => bubble.classList.remove('show'), 4200);
      } else {
        bubble.classList.remove('show');
      }
      if (bubbleUrl && state !== 'idle') {
        const l = layerEl('bubble-face');
        setSegArt(l, bubbleUrl);
        clearTimeout(bubbleArtTimer);
        bubbleArtTimer = setTimeout(() => setSegArt(l, null), 2600);
      }
    }
    function scheduleBubble() {
      clearTimeout(bubbleLoop);
      bubbleLoop = setTimeout(() => {
        if (state !== 'idle') showBubble();
        scheduleBubble();
      }, 9000 + Math.random() * 7000);          // 9~16 秒来一次
    }

    /* 气泡：按表情写位置 / 大小 / 旋转 */
    function applyBubble(s) {
      const l = layerEl('bubble-face');
      if (!l) return;
      const b = BUBBLES[s] || {};
      l.style.transformOrigin = BUBBLE_ORIGIN;
      l.style.transform = 'translate(' + ((b.dx || 0) / 10).toFixed(2) + '%,' + ((b.dy || 0) / 14).toFixed(2) +
        '%) rotate(' + (b.r || 0).toFixed(2) + 'deg) scale(' + (((b.s == null ? 100 : b.s)) / 100).toFixed(3) + ')';
    }

    const variantsFor = s => ARM_POSES[s] || ARM_POSES.idle;
    function setVariant(i) {
      const list = variantsFor(state);
      variantIdx = ((i % list.length) + list.length) % list.length;
      applyPose(list[variantIdx]);
    }
    function scheduleVariants() {
      if (variantTimer) { clearInterval(variantTimer); variantTimer = null; }
      if (variantsFor(state).length < 2) return;
      variantTimer = setInterval(() => {
        const list = variantsFor(state);
        if (list.length < 2) return;
        let n = variantIdx;
        while (n === variantIdx) n = Math.floor(Math.random() * list.length);
        setVariant(n);
      }, VARIANT_MS);
    }

    function applyCharacterPose() {
      const w = BASE_WIDTH * pose.scale / 100;
      el.style.left = pose.x + '%';
      el.style.top = pose.y + '%';
      stage.style.width = w + 'px';
      el.classList.toggle('flip', pose.x > 45);
      const xi = host.querySelector('#poseX'), yi = host.querySelector('#poseY'), si = host.querySelector('#poseS');
      if (xi) xi.value = pose.x;
      if (yi) yi.value = pose.y;
      if (si) si.value = pose.scale;
      const xv = host.querySelector('#poseXv'), yv = host.querySelector('#poseYv'), sv = host.querySelector('#poseSv');
      if (xv) xv.textContent = pose.x + '%';
      if (yv) yv.textContent = pose.y + '%';
      if (sv) sv.textContent = pose.scale + '%';
    }
    applyCharacterPose();
    setVariant(0);
    scheduleVariants();
    applyBubble(state);

    /* 眨眼：仅当该表情存在 -blink 差分时启用 */
    let blinkUrl = null;
    function stopBlink() { if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; } }
    function startBlink() {
      stopBlink();
      if (!blinkUrl) return;
      blinkTimer = setInterval(() => {
        const l = layerEl('face-feat'); if (!l) return;
        const img = l.querySelector('.art');
        const open = l.dataset.openUrl;
        if (!open || !blinkUrl) return;
        img.src = blinkUrl;
        setTimeout(() => { if (l.dataset.openUrl === open) img.src = open; }, 140);
      }, 3400);
    }

    async function refreshArt() {
      const my = ++token;

      /* 手臂：大臂 / 小臂各一张，左右共用 */
      firstAvailable([BASE + ARM_FILES.upper]).then(url => {
        if (my !== token) return;
        ['L', 'R'].forEach(s => setSegArt(armNode(s, 'sway'), url));
      });
      firstAvailable([BASE + ARM_FILES.fore]).then(url => {
        if (my !== token) return;
        ['L', 'R'].forEach(s => setSegArt(armNode(s, 'seg'), url));
      });

      const jobs = LAYERS.map(async p => {
        /* 平静等没有气泡图的表情直接跳过，别去探 bubble-idle.png（否则控制台一条 404） */
        if (p.id === 'bubble-face' && !BUBBLES[state]) {
          bubbleUrl = null;
          if (my === token) showBubble();
          return;
        }
        const url = await firstAvailable(p.files.map(f => BASE + fill(f, state)));
        if (my !== token) return;
        setSegArt(layerEl(p.id), url);
        if (p.id === 'face-feat') {
          const l = layerEl('face-feat');
          l.dataset.openUrl = url || '';
          // 眨眼差分：三个为难表情直接共用 face-warn-blink.png（不再先探自己的那张，避免控制台 404）
          const cands = SHARED_BLINK_FOR.indexOf(state) >= 0
            ? [BASE + SHARED_BLINK]
            : [BASE + fill(p.blink, state)];
          const b = await firstAvailable(cands);
          if (my !== token) return;
          blinkUrl = b;
          startBlink();
        }
        if (p.id === 'bubble-face') {
          bubbleUrl = url || null;
          showBubble();
        }
      });
      await Promise.all(jobs);
    }

    function setState(next) {
      if (EXPRESSIONS.indexOf(next) < 0) next = 'idle';
      if (next === state) return;
      state = next;
      const l = layerEl('face-feat');
      if (l) { const ph = l.querySelector('.ph-face-feat'); if (ph) ph.outerHTML = featuresSVG(next); }
      setVariant(0);
      scheduleVariants();
      applyBubble(state);
      showBubble();
      refreshArt();
    }

    refreshArt();
    scheduleBubble();

    /* 面板开合 */
    const ctlToggle = host.querySelector('#ctlToggle');
    const ctlPanel = host.querySelector('#ctlPanel');
    ctlToggle.addEventListener('click', () => {
      ctlPanel.hidden = !ctlPanel.hidden;
      ctlToggle.setAttribute('aria-expanded', String(!ctlPanel.hidden));
    });

    /* 滑块 */
    ['X', 'Y', 'S'].forEach(k => {
      const inp = host.querySelector('#pose' + k);
      if (!inp) return;
      inp.addEventListener('input', () => {
        if (k === 'X') pose.x = Number(inp.value);
        if (k === 'Y') pose.y = Number(inp.value);
        if (k === 'S') pose.scale = Number(inp.value);
        applyCharacterPose(); savePose(pose);
      });
    });
    const reset = host.querySelector('#poseReset');
    if (reset) reset.addEventListener('click', () => {
      pose = Object.assign({}, DEFAULT_POSE);
      applyCharacterPose(); savePose(pose);
    });

    /* 拖动移动 */
    let drag = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.puppet-ctl')) return;
      const rect = el.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const x = (e.clientX - drag.dx) / window.innerWidth * 100;
      const y = (e.clientY - drag.dy) / window.innerHeight * 100;
      pose.x = Math.round(Math.max(-5, Math.min(75, x)));
      pose.y = Math.round(Math.max(-5, Math.min(80, y)));
      applyCharacterPose();
    });
    const endDrag = e => {
      if (!drag) return;
      drag = null;
      el.classList.remove('dragging');
      savePose(pose);
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    return {
      setState,
      getState: () => state,
      getPose: () => pose,
      resetPose: () => { pose = Object.assign({}, DEFAULT_POSE); applyCharacterPose(); savePose(pose); },
      applyPose,
      getPoseTable: () => ARM_POSES,
      currentPose: () => variantsFor(state)[variantIdx]
    };
  }

  root.SQ.character = {
    BASE, LAYERS, ANCHORS, ARM_ANCHORS, ARM_POSES, ARM_FILES, EXPRESSIONS, BUBBLE_TEXT, POSE_NAMES,
    HAND_ALIAS, SHARED_BLINK, SHARED_BLINK_FOR, BUBBLES, BUBBLE_ORIGIN,
    partFile: id => BASE + id + '.png',
    faceFile: state => BASE + 'face-' + state + '-open.png',
    blinkFile: state => BASE + 'face-' + state + '-blink.png',
    bubbleFile: state => BASE + 'bubble-' + state + '.png',
    handFile: type => BASE + 'hand-' + type + '.png',
    artLoaded, artFailed, mount, loadPose, savePose
  };
})(typeof window !== 'undefined' ? window : globalThis);
