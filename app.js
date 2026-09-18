/* =========================================================================
 * app.js — 界面层
 * 流程：书架 → 关卡（剧情 → 设计面板 → 提交 → 研究结果 → 结论选择题）→ 结算
 * 计分：本关实验分数 = 0.7 × 设计分 + 0.3 × 选择题分
 *       设计分 = 设计得分 × 罚分系数（首次达标 1.0 / 重做达标 0.6 / 用提示 0.3）
 *       选择题 = 首答对 1.0 / 纠错后 0.6 / 用提示 0.3
 * ========================================================================= */
(function () {
  'use strict';

  const SQ = window.SQ;
  const levels = SQ.levels;
  const app = document.getElementById('app');

  let data = SQ.store.load() || { version: 2, levels: {} };
  let currentId = null;
  let currentPuppet = null;
  let currentPuppetState = 'idle';

  /* ---------------- 状态 ---------------- */
  function defaultParams(l) {
    const p = {};
    l.controls.forEach(c => { p[c.id] = c.type === 'checks' ? {} : c.default; });
    return p;
  }
  function blankLevel(l) {
    return {
      params: defaultParams(l),
      design: { attempts: 0, hintUsed: false, passed: false, result: null, factor: 0, final: 0 },
      quiz: {},
      levelScore: 0,
      completed: false
    };
  }
  function ensureDefaults() {
    data.levels = data.levels || {};
    if (typeof data.blindBox !== 'boolean') data.blindBox = !!(SQ.config && SQ.config.blindBoxDefault);
    if (typeof data.blindBoxManual !== 'boolean') data.blindBoxManual = false;
    levels.forEach(l => {
      let cur = data.levels[l.id];
      if (!cur || !cur.design) { cur = blankLevel(l); data.levels[l.id] = cur; }
      cur.params = Object.assign({}, defaultParams(l), cur.params || {});
      cur.quiz = cur.quiz || {};
      l.quiz.questions.forEach(q => {
        if (!cur.quiz[q.id]) cur.quiz[q.id] = { attempts: 0, hintUsed: false, correct: false, factor: 0, score: 0 };
      });
    });
  }
  const persist = () => SQ.store.save(data);
  const byId = id => levels.find(l => l.id === id);
  const st = id => data.levels[id];

  const quizAvg = (l, s) => {
    const qs = l.quiz.questions;
    return qs.reduce((a, q) => a + (s.quiz[q.id] ? s.quiz[q.id].score : 0), 0) / qs.length;
  };
  const isCompleted = (l, s) => s.design.passed && l.quiz.questions.every(q => s.quiz[q.id] && s.quiz[q.id].correct);
  const overall = () => Math.round(levels.reduce((a, l) => a + st(l.id).levelScore, 0) / levels.length);
  const completedCount = () => levels.filter(l => st(l.id).completed).length;

  function recomputeLevel(l) {
    const s = st(l.id);
    s.levelScore = s.design.passed
      ? Math.round(0.7 * s.design.final + 0.3 * quizAvg(l, s))
      : 0;
    s.completed = isCompleted(l, s);
    // 首通模式：首次完成一关后自动关闭（玩家手动设置过则尊重其选择）
    if (s.completed && !data.blindBoxManual && data.blindBox) data.blindBox = false;
  }

  const factorOf = attempts => (attempts <= 1 ? 1 : attempts === 2 ? 0.6 : 0.3);

  /* ---------------- 书架 ---------------- */
  function renderHome() {
    currentId = null;
    currentPuppetState = 'idle';
    updateTopReminder('idle');          // 书架页不挂提醒条
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    const cc = completedCount(), total = levels.length, ov = overall();

    app.innerHTML = `
      <div class="wrap">
        <header class="hero">
          <div class="kicker">科学侦探 · 实验设计</div>
          <h1>从关联到因果</h1>
          <p class="lead">六个实验设计任务。每一步都要在「证明有效」和「成本可控」之间取舍——可信度决定大部分分数，效益决定小部分。</p>
          <div class="hero-stats">
            <div><span class="num">${cc}/${total}</span><span class="cap">已完成</span></div>
            <div><span class="num">${ov}</span><span class="cap">当前总分</span></div>
          </div>
          ${cc === total ? '<div class="done-banner">六个实验全部完成。你设计的证据，从人群一路落到了分子与动物模型。</div>' : ''}
        </header>
        <section class="modebar">
          <button class="mode-toggle ${data.blindBox ? 'on' : ''}" id="blindBox" aria-pressed="${data.blindBox}">
            <span class="mt-icon" aria-hidden="true">🎁</span>
            <span class="mt-body">
              <span class="mt-title">盲盒模式：${data.blindBox ? '已开启' : '已关闭'}</span>
              <span class="mt-desc">${data.blindBox
                ? '设计得分全程隐藏，改由左侧角色的表情提示你的设计是否偏离区间；分数在关卡完成时揭晓。'
                : '点击开启：不显示设计得分，改为凭判断设计，由角色表情给出提示。'}</span>
            </span>
          </button>
        </section>

        <section class="grid">${levels.map(levelCard).join('')}</section>
        <div class="home-foot">
          ${cc > 0 ? '<button class="btn" id="toSummary">查看结算</button>' : ''}
          <button class="btn ghost" id="reset">重开全部进度</button>
          <span class="muted">进度只保存在本机浏览器，不会上传。</span>
        </div>
      </div>`;

    app.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => openLevel(el.dataset.open)));
    const bb = app.querySelector('#blindBox');
    if (bb) bb.addEventListener('click', () => { data.blindBox = !data.blindBox; data.blindBoxManual = true; persist(); renderHome(); });
    const ts = app.querySelector('#toSummary'); if (ts) ts.addEventListener('click', renderSummary);
    app.querySelector('#reset').addEventListener('click', () => {
      if (confirm('确定要清空全部进度吗？')) {
        SQ.store.clear(); data = { version: 2, levels: {} }; ensureDefaults(); persist(); renderHome();
      }
    });
  }

  function levelCard(l, i) {
    const s = st(l.id);
    let badge;
    if (s.completed) badge = `<span class="badge good">${s.levelScore} 分</span>`;
    else if (s.design.passed) badge = `<span class="badge mid">设计已达标 · 待结论</span>`;
    else if (s.design.attempts > 0) badge = `<span class="badge mid">挑战中</span>`;
    else badge = `<span class="badge">未开始</span>`;
    return `<button class="card" data-open="${l.id}">
      <div class="card-top"><span class="idx">${String(i + 1).padStart(2, '0')}</span><span class="diff">难度 ${l.difficulty}/5</span></div>
      <h3>${l.title}</h3>
      <div class="tags"><span>${l.domain}</span><span>${l.skill}</span></div>
      <p class="card-desc">${l.summary}</p>
      ${badge}
    </button>`;
  }

  /* ---------------- 控件渲染 ---------------- */
  function choiceControl(c, s) {
    return `<div class="ctrl">
      <div class="ctrl-head"><label>${c.label}</label></div>
      <div class="optlist">
        ${c.options.map(o => `
          <div class="opt ${s.params[c.id] === o.v ? 'selected' : ''}" data-ctl="${c.id}" data-val="${o.v}">
            <button type="button" class="opt-lab" data-val="${o.v}">${o.t}</button>
            <button type="button" class="opt-info" aria-expanded="false" aria-label="选项说明">?</button>
            <div class="opt-tip" hidden>${o.tip}</div>
          </div>`).join('')}
      </div>
    </div>`;
  }

  function checksControl(c, s) {
    return `<div class="ctrl">
      <div class="ctrl-head"><label>${c.label}</label></div>
      <div class="optlist">
        ${c.options.map(o => `
          <div class="opt ${s.params[c.id][o.v] ? 'selected' : ''}">
            <label class="opt-lab">
              <input type="checkbox" data-ctl="${c.id}" data-val="${o.v}" ${s.params[c.id][o.v] ? 'checked' : ''}>
              <span>${o.t}</span>
            </label>
            <button type="button" class="opt-info" aria-expanded="false" aria-label="选项说明">?</button>
            <div class="opt-tip" hidden>${o.tip}</div>
          </div>`).join('')}
      </div>
    </div>`;
  }

  function rangeControl(c, s) {
    const v = s.params[c.id];
    const shown = c.format ? c.format(v) : v + (c.unit || '');
    return `<div class="ctrl">
      <div class="ctrl-head"><label>${c.label}</label><output id="out-${c.id}">${shown}</output></div>
      <input type="range" data-ctl="${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}"
             aria-label="${c.label}" aria-valuetext="${shown}">
      ${c.note ? `<p class="ctrl-note">${c.note}</p>` : ''}
    </div>`;
  }

  const controlHTML = (c, s) =>
    c.type === 'choice' ? choiceControl(c, s) : c.type === 'checks' ? checksControl(c, s) : rangeControl(c, s);

  /* ---------------- 术语说明 ---------------- */
  function glossaryHTML(l) {
    if (!l.glossary || !l.glossary.length) return '';
    return `<details class="glossary">
      <summary>术语说明 · 点开看名词解释</summary>
      <dl>${l.glossary.map(g => `<dt>${g.t}</dt><dd>${g.d}</dd>`).join('')}</dl>
    </details>`;
  }

  /* ---------------- 图片位 ---------------- */
  function figFor(l, slot) { return (l.images && l.images[slot]) || null; }

  function figureHTML(img) {
    if (!img) return '';
    const src = (img.src || '').trim();
    if (!src) {
      if (!SQ.config || !SQ.config.showImagePlaceholders) return '';
      return `<figure class="fig fig-ph">
        <div class="ph-box">
          <span class="ph-tag">图片位 · ${img.slot || '插图'}</span>
          <span class="ph-path">把图片放到 <code>${img.file || 'assets/levels/...'}</code></span>
          <span class="ph-tip">再到 js/levels.js 里对应关卡填好 src 与 caption</span>
        </div>
      </figure>`;
    }
    return `<figure class="fig">
      <img src="${src}" alt="${img.alt || img.caption || ''}" loading="lazy"
           onerror="this.closest('figure').classList.add('img-broken')">
      ${img.caption ? `<figcaption>${img.caption}</figcaption>` : ''}
    </figure>`;
  }

  /* ---------------- 研究结果 ---------------- */
  function resultHTML(r, img) {
    if (!r) return '';
    const fig = figureHTML(img);
    if (r.kind === 'text') {
      return `<div class="result">${fig}
        <h3 class="rh">${r.title}</h3>
        <ul class="res-lines">${r.lines.map(x => `<li>${x}</li>`).join('')}</ul>
        ${r.note ? `<p class="res-note">${r.note}</p>` : ''}
      </div>`;
    }
    if (r.kind === 'table') {
      return `<div class="result">${fig}
        <h3 class="rh">${r.title}</h3>
        <table class="res-table">
          <thead><tr>${r.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${r.rows.map(row => `<tr>${row.map((c, i) => `<td>${i === 0 ? c : `<b>${c}</b>`}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
        ${r.note ? `<p class="res-note">${r.note}</p>` : ''}
      </div>`;
    }
    if (r.kind === 'seq') {
      const bar = pct => `<span class="bar"><span style="width:${pct}%"></span></span>`;
      return `<div class="result">${fig}
        <h3 class="rh">${r.title}</h3>
        <div class="seqgrid">
          <div class="seqbox">
            <h4>HBV 整合位点（例数 / 20）</h4>
            ${r.integration.map(x => `<div class="seqrow"><span class="seqname">${x.gene}</span>${bar(x.n / 20 * 100)}<b>${x.n}</b></div>`).join('')}
          </div>
          <div class="seqbox">
            <h4>突变谱（突变频率 %）</h4>
            ${r.mutations.map(x => `<div class="seqrow"><span class="seqname">${x.gene}</span>${bar(x.pct)}<b>${x.pct}%</b></div>`).join('')}
          </div>
          <div class="seqbox">
            <h4>免疫微环境（阳性比例 %）</h4>
            ${r.immune.map(x => `<div class="seqrow"><span class="seqname">${x.item}</span>${bar(x.pct)}<b>${x.pct}%</b></div>`).join('')}
          </div>
        </div>
        ${r.note ? `<p class="res-note">${r.note}</p>` : ''}
      </div>`;
    }
    return '';
  }

  /* ---------------- 选择题 ---------------- */
  /* 选项随机打乱：每次进入关卡重新排一次，页内保持稳定（答案按选项 id 记录，不受顺序影响） */
  let optOrder = {};
  function shuffledOptions(q) {
    if (!optOrder[q.id]) {
      const idx = q.options.map((_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) {          // Fisher–Yates
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      optOrder[q.id] = idx;
    }
    return optOrder[q.id].map(i => q.options[i]);
  }

  function quizHTML(l, s) {
    return `<section class="quizwrap" id="quizwrap">
      <h3 class="section-h">${l.quiz.title}<span class="quiz-shuffle">选项顺序每次进入都会重新排列</span></h3>
      ${l.quiz.questions.map((q, qi) => {
        const qs = s.quiz[q.id];
        return `<div class="q" data-qid="${q.id}">
          <p class="q-prompt"><span class="q-no">Q${qi + 1}</span>${q.prompt}</p>
          <div class="optlist">
            ${shuffledOptions(q).map(o => `
              <div class="opt" data-qid="${q.id}" data-oid="${o.id}">
                <button type="button" class="opt-lab" data-oid="${o.id}">${o.t}</button>
                <button type="button" class="opt-info" aria-expanded="false" aria-label="选项说明">?</button>
                <div class="opt-tip" hidden>${o.tip}</div>
              </div>`).join('')}
          </div>
          <div class="q-actions">
            <button type="button" class="btn ghost small" data-qhint="${q.id}">提示</button>
            <span class="q-status" id="qs-${q.id}"></span>
          </div>
          <div class="q-feedback" id="qf-${q.id}"></div>
        </div>`;
      }).join('')}
    </section>`;
  }

  function paintQuizStatus(l, s) {
    l.quiz.questions.forEach(q => {
      const qs = s.quiz[q.id];
      const qEl = app.querySelector(`.q[data-qid="${q.id}"]`);
      if (!qEl) return;
      const status = app.querySelector('#qs-' + q.id);
      const fb = app.querySelector('#qf-' + q.id);
      qEl.classList.toggle('answered', qs.correct);
      qEl.querySelectorAll('.opt').forEach(o => {
        o.classList.toggle('chosen', qs.chosen === o.dataset.oid);
        o.classList.toggle('correct', qs.correct && o.dataset.oid === q.options.find(x => x.correct).id);
      });
      if (status) status.textContent = qs.correct ? `已答对 · 本题得分 ${qs.score}` : (qs.attempts ? '已尝试，可再选' : '');
      if (fb && qs.lastFeedback) {
        fb.className = 'q-feedback ' + (qs.correct ? 'good' : 'bad');
        fb.textContent = qs.lastFeedback;
      }
    });
  }

  /* ---------------- 关卡页 ---------------- */
  function openLevel(id) {
    currentId = id;
    optOrder = {};                       // 每进一次关卡重新打乱选项
    if (location.hash !== '#' + id) location.hash = id;
    const l = byId(id);
    const idx = levels.indexOf(l);
    const s = st(id);

    const locked = s.design.passed;

    app.innerHTML = `
      <div class="puppet-host" id="puppetHost"></div>

      <div class="wrap level">
        <header class="lhead">
          <button class="btn ghost" id="back">← 书架</button>
          <div class="ltitle"><span class="kicker">第 ${idx + 1} 关 / ${levels.length}</span><h2>${l.title}</h2></div>
          <div class="lmeta">${l.domain}<br>${l.skill}</div>
        </header>

        ${figureHTML(figFor(l, 'hero'))}

        <article class="story">${l.paragraphs.map(t => `<p>${t}</p>`).join('')}</article>
        ${figureHTML(figFor(l, 'story'))}
        <section class="mission"><span class="mtag">任务</span>${l.mission}</section>
        ${glossaryHTML(l)}

        <section class="panel ${locked ? 'locked' : ''}" id="panel">
          <h3 class="section-h">设计面板</h3>
          <div class="controls">${l.controls.map(c => controlHTML(c, s)).join('')}</div>
        </section>

        <section class="metrics-wrap">
          <div class="mhead"><h3>实时计算</h3><div class="preview">设计得分 <b id="preview">--</b></div></div>
          <div class="metrics" id="metrics" aria-live="polite"></div>
          <div id="livewarn"></div>
        </section>

        <div class="actions">
          <button class="btn" id="submit" ${locked ? 'disabled' : ''}>${locked ? (l.submitLabel ? '实验已完成' : '设计已达标') : (l.submitLabel || '提交设计')}</button>
          <button class="btn ghost" id="hint" ${locked ? 'disabled' : ''}>${s.design.hintUsed ? '再看提示' : '查看提示'}</button>
        </div>

        <section class="feedback" id="feedback"></section>
        <div class="hintbox" id="hintbox" hidden></div>

        <section class="resultwrap" id="resultwrap" ${locked ? '' : 'hidden'}>${resultHTML(SQ.simulate(l.id, s.params) || l.result, figFor(l, 'result'))}</section>

        <section class="quizhost" id="quizhost" ${locked ? '' : 'hidden'}>
          ${locked ? quizHTML(l, s) : ''}
        </section>

        <section class="levelscore" id="levelscore"></section>

        <footer class="lnav">
          <button class="btn ghost" data-go="${idx - 1}" ${idx === 0 ? 'disabled' : ''}>← 上一关</button>
          ${idx === levels.length - 1
            ? `<button class="btn" id="toSummary" ${completedCount() ? '' : 'disabled'}>查看结算 →</button>`
            : `<button class="btn ghost" data-go="${idx + 1}">下一关 →</button>`}
        </footer>
      </div>`;

    app.querySelector('#back').addEventListener('click', renderHome);
    app.querySelector('#submit').addEventListener('click', () => submitDesign(id));
    app.querySelector('#hint').addEventListener('click', () => showHint(id));
    const ts = app.querySelector('#toSummary'); if (ts) ts.addEventListener('click', renderSummary);
    app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      const n = Number(b.dataset.go);
      if (n >= 0 && n < levels.length) openLevel(levels[n].id);
    }));

    const host = app.querySelector('#puppetHost');
    currentPuppet = (host && SQ.config.showCharacter) ? SQ.character.mount(host) : null;

    wireControls(l);
    wireQuiz(l);
    refreshMetrics(id);
    if (s.design.result) renderFeedback(id, s.design.result, s.design);
    paintQuizStatus(l, s);
    renderLevelScore(l, s);
  }

  function wireControls(l) {
    const s = st(l.id);
    if (s.design.passed) return; // 达标后锁定

    app.querySelectorAll('input[type=range][data-ctl]').forEach(inp => {
      inp.addEventListener('input', () => { s.params[inp.dataset.ctl] = Number(inp.value); persist(); refreshMetrics(l.id); });
    });
    app.querySelectorAll('.optlist .opt-lab[data-val]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrap = btn.closest('.ctrl');
        const ctl = wrap.querySelector('.opt').dataset.ctl;
        s.params[ctl] = Number(btn.dataset.val);
        wrap.querySelectorAll('.opt').forEach(o => o.classList.toggle('selected', o === btn.closest('.opt')));
        persist(); refreshMetrics(l.id);
      });
    });
    app.querySelectorAll('input[type=checkbox][data-ctl]').forEach(cb => {
      cb.addEventListener('change', () => {
        s.params[cb.dataset.ctl][cb.dataset.val] = cb.checked;
        cb.closest('.opt').classList.toggle('selected', cb.checked);
        persist(); refreshMetrics(l.id);
      });
    });
  }

  function refreshMetrics(id) {
    const l = byId(id);
    const s = st(id);
    const bb = !!data.blindBox;

    if (s.design.passed) {
      const pv0 = app.querySelector('#preview');
      if (pv0) pv0.textContent = bb ? '盲盒中…' : (s.design.result ? s.design.result.designScore + ' / 100' : '--');
      const w0 = app.querySelector('#livewarn');
      if (w0) w0.innerHTML = '';
      updatePuppet(id);
      return;
    }
    const r = SQ.evaluateDesign(id, s.params);

    l.controls.forEach(c => {
      if (c.type === 'range') {
        const shown = c.format ? c.format(s.params[c.id]) : s.params[c.id] + (c.unit || '');
        const out = app.querySelector('#out-' + c.id); if (out) out.textContent = shown;
        const inp = app.querySelector(`input[data-ctl="${c.id}"]`); if (inp) inp.setAttribute('aria-valuetext', shown);
      }
    });

    const m = app.querySelector('#metrics');
    if (m) m.innerHTML = r.metrics.map(mt => metric(mt.label, mt.value, mt.unit, mt.tone)).join('');

    // 盲盒模式：不显示得分，改由角色表情与一句定性提醒
    const pv = app.querySelector('#preview');
    if (pv) pv.textContent = bb ? '盲盒中…' : (r.designScore + ' / 100');
    const warn = app.querySelector('#livewarn');
    if (warn) warn.innerHTML = bb ? blindBoxHint(r) : '';

    updatePuppet(id);
  }

  function blindBoxHint(r) {
    const w = [];
    if (r.credibility < 50) w.push('证据可能不够');
    if (r.timeCost > 70 || r.moneyCost > 80) w.push('成本可能偏高');
    return w.length
      ? `<div class="livewarn">🎁 盲盒模式：${w.join(' · ')}——看看左侧角色的表情。</div>`
      : '';
  }

  // 角色表情状态：与设计状态同步
  // 设计达标后不再一直挂着 pass：提交瞬间出「pass」，5 秒后回到 idle
  function puppetState(id) {
    const s = st(id);
    const r = SQ.evaluateDesign(id, s.params);
    if (s.design.passed) return 'idle';
    const credBad = r.credibility < 50;
    const costBad = r.timeCost > 70 || r.moneyCost > 80;
    if (credBad && costBad) return 'warn-both';
    if (credBad) return 'warn-cred';
    if (costBad) return 'warn-cost';
    if (s.design.attempts > 0) return 'fail';
    return 'idle';
  }

  /* 临时表情：播完 ms 毫秒自动回到常规状态 */
  let puppetFlashState = null, puppetFlashTimer = null;
  function flashPuppet(state, ms) {
    puppetFlashState = state;
    currentPuppetState = state;
    if (currentPuppet) currentPuppet.setState(state);
    updateTopReminder(state);
    clearTimeout(puppetFlashTimer);
    puppetFlashTimer = setTimeout(() => {
      puppetFlashState = null;
      if (currentId) updatePuppet(currentId);
    }, ms);
  }

  function updatePuppet(id) {
    const s = puppetFlashState || puppetState(id);
    currentPuppetState = s;
    if (currentPuppet) currentPuppet.setState(s);
    updateTopReminder(s);
  }

  /* ---------------- 顶部悬挂提醒条（无角色版本用） ---------------- */
  let reminderEl = null, reminderTimer = null;
  const REMINDER_ICON = { 'warn-cred': '❓', 'warn-cost': '💸', 'warn-both': '😖', pass: '👍', fail: '💭' };
  function pickReminderText(s) {
    const arr = (SQ.character.BUBBLE_TEXT || {})[s] || [];
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : '';
  }
  function updateTopReminder(s) {
    if (!SQ.config.topReminder) return;
    if (!reminderEl) {
      reminderEl = document.createElement('div');
      reminderEl.className = 'top-reminder';
      reminderEl.id = 'topReminder';
      reminderEl.setAttribute('role', 'status');
      document.body.appendChild(reminderEl);
    }
    const text = pickReminderText(s);
    if (!text) { reminderEl.classList.remove('show'); return; }
    reminderEl.dataset.state = s;
    reminderEl.innerHTML = '<span class="tr-icon"></span><span class="tr-text"></span>';
    reminderEl.querySelector('.tr-icon').textContent = REMINDER_ICON[s] || '💬';
    reminderEl.querySelector('.tr-text').textContent = text;
    reminderEl.classList.add('show');
    clearTimeout(reminderTimer);
    reminderTimer = setTimeout(() => { if (currentPuppetState === s) updateTopReminder(s); }, 11000 + Math.random() * 5000);
  }

  const metric = (label, value, unit, t) =>
    `<div class="metric ${t}"><div class="mlabel">${label}</div><div class="mvalue">${value}<span class="munit">${unit}</span></div></div>`;

  /* ---------------- 提交设计 ---------------- */
  function submitDesign(id) {
    const l = byId(id);
    const s = st(id);
    if (s.design.passed) return;

    const r = SQ.evaluateDesign(id, s.params);
    s.design.attempts += 1;
    s.design.result = r;

    if (r.pass) {
      s.design.passed = true;
      s.design.factor = s.design.hintUsed ? 0.3 : factorOf(s.design.attempts);
      s.design.final = Math.round(r.designScore * s.design.factor);
      recomputeLevel(l);
      persist();
      // 解锁结果与选择题
      const rw = app.querySelector('#resultwrap'); if (rw) { rw.hidden = false; rw.innerHTML = resultHTML(SQ.simulate(id, s.params) || l.result, figFor(l, 'result')); }
      const qh = app.querySelector('#quizhost'); if (qh) { qh.hidden = false; qh.innerHTML = quizHTML(l, s); }
      wireQuiz(l);
      paintQuizStatus(l, s);
      flashPuppet('pass', 5000);          // 达标动画只播 5 秒，之后回到 idle
      app.querySelector('#submit').disabled = true;
      app.querySelector('#submit').textContent = '设计已达标';
      app.querySelector('#hint').disabled = true;
      app.querySelector('#panel').classList.add('locked');
      app.querySelector('#hintbox').hidden = true;
    } else {
      persist();
    }
    updatePuppet(id);
    renderFeedback(id, r, s.design);
  }

  function renderFeedback(id, r, d) {
    const fb = app.querySelector('#feedback'); if (!fb) return;
    const bb = !!data.blindBox;
    const verdict = r.pass
      ? '<span class="v good">✔ 落在正确区间</span>'
      : '<span class="v bad">✘ 尚未达标</span>';
    const factorTxt = d.factor === 1 ? '首次提交，无扣分' : d.factor === 0.6 ? '重做后达标，×0.6' : d.factor === 0.3 ? '使用了提示，×0.3' : '';
    const scoreRow = bb ? '' : `
      <div class="fb-score">
        <div class="fsc"><span class="fs-num">${r.designScore}</span><span class="fs-cap">设计得分</span></div>
        <span class="fs-x">×</span>
        <div class="fsc"><span class="fs-num">${r.pass ? d.factor : '—'}</span><span class="fs-cap">罚分系数</span></div>
        <span class="fs-x">=</span>
        <div class="fsc"><span class="fs-num hl">${r.pass ? d.final : '—'}</span><span class="fs-cap">本关设计分</span></div>
        <div class="fs-best">可信度 ${r.credibility} · 效益 ${r.efficiency}</div>
      </div>`;
    fb.innerHTML = `
      <div class="fb-top">${verdict}<span class="fb-sub">第 ${d.attempts} 次提交${bb ? '' : (factorTxt ? ' · ' + factorTxt : '')}</span></div>
      ${scoreRow}
      <ul class="msgs">${r.messages.map(m => `<li class="${m.tone}">${m.text}</li>`).join('')}</ul>
      ${r.pass ? '<div class="fb-next">设计达标——继续往下，读研究结果并回答结论题。</div>'
               : `<div class="fb-next dim">${bb ? '盲盒开启中：调整参数后再次提交，由角色表情提示你是否接近区间。' : '调整参数后再次提交；重做达标会按 0.6 计分，使用提示后按 0.3 计分。'}</div>`}`;
  }

  function showHint(id) {
    const l = byId(id);
    const s = st(id);
    const box = app.querySelector('#hintbox'); if (!box) return;
    if (!s.design.passed && !s.design.hintUsed) { s.design.hintUsed = true; persist(); }
    box.hidden = false;
    box.innerHTML = `<span class="mtag">提示</span>${l.hint}<div class="hint-note">使用提示后，本关设计分系数降至 0.3。</div>`;
    const hb = app.querySelector('#hint'); if (hb) hb.textContent = '再看提示';
  }

  /* ---------------- 选择题逻辑 ---------------- */
  function wireQuiz(l) {
    const s = st(l.id);
    app.querySelectorAll('.q').forEach(qEl => {
      const qid = qEl.dataset.qid;
      const q = l.quiz.questions.find(x => x.id === qid);
      const qs = s.quiz[qid];
      qEl.querySelectorAll('.opt-lab[data-oid]').forEach(btn => {
        btn.addEventListener('click', () => chooseAnswer(l, q, qs, btn.dataset.oid));
      });
    });
    app.querySelectorAll('[data-qhint]').forEach(b => {
      b.addEventListener('click', () => {
        const qid = b.dataset.qhint;
        const q = l.quiz.questions.find(x => x.id === qid);
        const qs = s.quiz[qid];
        if (!qs.correct && !qs.hintUsed) { qs.hintUsed = true; persist(); }
        const fb = app.querySelector('#qf-' + qid);
        if (fb) { fb.className = 'q-feedback hint'; fb.textContent = '提示：' + q.hint; }
        b.textContent = '再提示';
      });
    });
  }

  function chooseAnswer(l, q, qs, oid) {
    if (qs.correct) return;
    const opt = q.options.find(o => o.id === oid);
    qs.attempts += 1;
    qs.chosen = oid;
    qs.lastFeedback = opt.feedback;
    if (opt.correct) {
      qs.correct = true;
      qs.factor = qs.hintUsed ? 0.3 : factorOf(qs.attempts);
      qs.score = Math.round(100 * qs.factor);
    }
    flashPuppet(opt.correct ? 'pass' : 'warn-cred', 5000);   // 答对→点赞，答错→担心(可信度)
    persist();
    paintQuizStatus(l, st(l.id));
    s_check(l);
  }

  function s_check(l) {
    const s = st(l.id);
    if (l.quiz.questions.every(q => s.quiz[q.id].correct)) {
      recomputeLevel(l); persist(); renderLevelScore(l, s);
    }
  }

  function renderLevelScore(l, s) {
    const host = app.querySelector('#levelscore'); if (!host) return;
    if (!s.completed) {
      host.innerHTML = s.design.passed
        ? `<p class="ls-hint">${data.blindBox ? '🎁 盲盒开启中：答对全部结论题后，揭晓本关分数。' : '答对全部结论题后，本关实验分数结算。'}</p>` : '';
      return;
    }
    const qa = Math.round(quizAvg(l, s));
    host.innerHTML = `
      <div class="ls">
        <div class="ls-title">本关实验分数</div>
        <div class="ls-body">
          <div class="ls-part"><span class="ls-num">${s.design.final}</span><span class="ls-cap">设计分 ×70%</span></div>
          <span class="ls-x">+</span>
          <div class="ls-part"><span class="ls-num">${qa}</span><span class="ls-cap">结论题 ×30%</span></div>
          <span class="ls-x">=</span>
          <div class="ls-part big"><span class="ls-num">${s.levelScore}</span><span class="ls-cap">本关分数</span></div>
        </div>
      </div>`;
  }

  /* ---------------- 结算 ---------------- */
  function renderSummary() {
    currentId = null;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    const total = overall();
    const grade = total >= 85 ? '优秀' : total >= 70 ? '良好' : total >= 55 ? '及格' : '待改进';
    const rows = levels.map((l, i) => {
      const s = st(l.id);
      const qa = s.design.passed ? Math.round(quizAvg(l, s)) : 0;
      return `<tr class="${s.completed ? '' : 'dim'}">
        <td><b>${i + 1}</b> ${l.title}</td>
        <td>${s.design.passed ? s.design.result.credibility : '—'}</td>
        <td>${s.design.passed && s.design.result.importance != null ? s.design.result.importance : '—'}</td>
        <td>${s.design.passed ? s.design.result.efficiency : '—'}</td>
        <td>${s.design.passed ? s.design.result.timeCost : '—'}</td>
        <td>${s.design.passed ? s.design.result.moneyCost : '—'}</td>
        <td>${s.design.passed ? s.design.final : '—'}</td>
        <td>${s.design.passed ? qa : '—'}</td>
        <td><b>${s.completed ? s.levelScore : '—'}</b></td>
      </tr>`;
    }).join('');

    app.innerHTML = `
      <div class="wrap summary">
        <header class="lhead">
          <button class="btn ghost" id="back">← 书架</button>
          <div class="ltitle"><span class="kicker">结算</span><h2>实验设计总分</h2></div>
          <div class="lmeta">满分 100<br>可信度×70% + 效益×30%<br>（第 6 关另含机制重要性）</div>
        </header>

        <div class="total-box">
          <div class="total-num">${total}</div>
          <div class="total-cap">总分 · ${grade}</div>
          <p class="total-note">总分 = 六关实验分数的平均值；每关 = 设计分×70% + 结论题×30%（第 6 关设计分含机制重要性）。</p>
        </div>

        <table class="res-table summary-table">
          <thead><tr>
            <th>关卡</th><th>可信度</th><th>机制重要性</th><th>效益</th><th>时间成本</th><th>经济成本</th><th>设计分</th><th>结论题</th><th>本关分数</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>

        <div class="summary-actions">
          <button class="btn" id="again">回到书架</button>
          <span class="muted">要追求更高总分，就回到对应的关卡，在可信度与成本之间重新做一次取舍。</span>
        </div>
      </div>`;

    app.querySelector('#back').addEventListener('click', renderHome);
    app.querySelector('#again').addEventListener('click', renderHome);
  }

  /* ---------------- 选项提示词（全局委托） ---------------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('.opt-info');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const tip = b.parentElement.querySelector('.opt-tip');
    if (!tip) return;
    tip.hidden = !tip.hidden;
    b.setAttribute('aria-expanded', String(!tip.hidden));
  });

  /* ---------------- 路由与启动 ---------------- */
  function route() {
    const id = (location.hash || '').replace('#', '');
    if (id === 'summary') { renderSummary(); return; }
    if (id && byId(id) && id !== currentId) openLevel(id);
    else if (!id && currentId) renderHome();
  }

  ensureDefaults();
  persist();
  window.addEventListener('hashchange', route);
  route();
  if (!currentId) renderHome();
})();
