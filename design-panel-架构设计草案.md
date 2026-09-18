# 「设计面板页（design-panel）」初步架构设计草案

> 目标：在现有《迷雾中的探险》(socrates-question) 中新增一类"可拖动参数 + 实时计算 + 区间判定"的关卡（思路二），并保持既有评分、存档、排行榜体系兼容。
> 状态：初稿，用于评审。文中标注 ⚠️ 的为需要拍板的开放问题。

---

## 0. 一句话结论

方案在架构上**可落地**：现有工程的"面板（panel）"本就是带 `type` 判别式的数据驱动结构（已存在 `visit / choose / reveal / forecast / respond / advance / restart` 等类型），新增一个 `design` 类型属于顺势扩展。

但思路二文档里的三点假设需要修正：

| 文档假设 | 实际情况 |
| --- | --- |
| "在 `index.html` 里加一个 `data-type=\"design-panel\"` 页面模板" | 线上 `index.html` 是**压缩打包产物**（单文件内联 React 运行时 + 全部故事数据，约 1.29M 字符），没有可读模板、没有 sourcemap。不能直接手改。 |
| "每个设计面板含 `<input type=range>`，`oninput` 调 `calculate()`" | 需按现有 **panel 数据模型 + 答题 reducer** 接入，而非裸 DOM/全局函数。 |
| "五个关卡" | 这五个关卡（乙肝→肝癌因果链）是**一整条新故事线**，大概率要新增一个 chapter；而排行榜/社区快照对 chapter 有**白名单校验**，必须同步改。 |

因此，草案的核心不是"写几个滑块"，而是**如何在既有兼容契约（评分公式、存档 schema、社区快照校验）下插入新页面类型**。

---

## 1. 现有代码基线（实测）

从已部署的 `index.cleaned`（即打包后的 `index.html`）反推得到：

- **技术栈**：React（生产打包、单文件内联），另有 `assets/js/audio-manifest.js` 外链；图片走 `assets/images/*`，插画/配音按需从 `comic-art/`、`comic-audio/` 加载。
- **章节**：`research, mrna, tsunami, cholera, hans, forgery, pulsar, aircraft, argon, nucleus` 共 10 个；每章有元数据 `{order, difficulty, level, domains[], skill, practice, whyNext, minutes, stage}`。
- **结构层级**：`chapter → scenes[] → panels[]`。scene 含 `id/chapter/title/date/place/people/paragraphs/clue/closing/note/sourceIds/terms/figureIds`；题目挂在 `panel.quiz`（`options[{id,label,result[],clue,questionTag}]`、`answerId`）。
- **答题记录 schema**：`answers[panel.id] = { attempts:[choiceId…], selected, acknowledged, events:[{id, kind:'choice'|'hint', choiceId}] }`。
- **评分公式（硬契约）**：
  ```
  score = round( (100*firstCorrect + 60*corrected + 30*hinted) / totalQuestions )
  ```
  其中 `totalQuestions = Il[chapter]` 是**按章节写死的常量**。
- **社区快照校验**：`nu()` 会拒绝任何 `totalQuestions !== Il[chapter]`、章节键不在白名单、或 `firstCorrect+corrected+hinted !== totalQuestions` 的记录。
- **存档**：`localStorage`，键 `socrates-comic-<chapter>-v<n>`；含 `runId`、`furthest`、`scoreRecord{completedAt, unrankedReason:'legacy'|'conflict'|'incomplete'}`；多标签页按 runId 合并（`Ne`），已完成章节取更早 `completedAt`。
- **音频**：每个选项有 `speechText + durationSeconds + sha256`（普通话合成音，非人声）。
- **无障碍**：全局有 focus 样式与 aria；设计上坚持"精确读数由可访问文字承担，不靠画面读值"。

### 关键耦合点（决定方案边界）

1. `totalQuestions` 是常量 → **在一章里加题，必须改常量**，会导致历史投稿成绩被快照校验丢弃（旧 `totalQuestions` 不匹配）。
2. chapter 白名单校验 → **新增章节必须同步改应用、快照生成器、社区 README**。
3. 答题记录 schema 有校验/合并逻辑 → **新增字段要谨慎**，否则存档迁移或多标签页合并会丢数据。

---

## 2. 目标与范围

**本期目标**
- 新增面板类型 `design`：剧情文字 + 1~2 个参数控件（滑块/勾选框）+ 实时指标 + 提交评分与文字反馈。
- 可作为独立关卡，也可插在既有选择题之间，形成"设计→看结果→反思"闭环。
- 复用既有评分/存档/无障碍/声音降级体系。

**明确不做（本期）**
- 不做后端服务；维持纯静态 GitHub Pages 部署。
- 不改动既有 10 章的题量与公式。
- 不为设计面板单独做排行榜口径。

---

## 3. 总体架构

```
story data (chapter → scenes → panels)
        │  panel.type === 'design'
        ▼
┌─────────────────────────────────────────────┐
│ DesignPanel 组件（视图层）                    │
│  · 剧情文字（paragraphs / prompt）            │
│  · 参数控件 (range / checkbox)                │
│  · 实时指标区（由 compute() 驱动）            │
│  · 反馈区 + 提交/重做                         │
└───────────────┬─────────────────────────────┘
                │ params
                ▼
┌─────────────────────────────────────────────┐
│ designRules 纯函数模块（领域逻辑，无 DOM）      │
│  · compute(levelId, params) -> metrics        │
│  · judge(levelId, params)   -> {score, pass,  │
│       feedback[]}                             │
└───────────────┬─────────────────────────────┘
                │ result
                ▼
┌─────────────────────────────────────────────┐
│ 答题 reducer（复用现有答题/事件/存档/合并）     │
│  把一次提交映射为 firstCorrect / corrected /   │
│  hinted 与 events 记录                        │
└─────────────────────────────────────────────┘
```

设计原则：**计算与判定是纯函数，与 React 解耦**，便于单测与调参；视图层只负责渲染与事件绑定。

---

## 4. 数据模型扩展

在 panel 判别式上新增一种：

```js
{
  id: 'hbv-l1',              // 稳定 id，作为答题记录 key
  type: 'design',
  prompt: '你需要设计一个研究来验证这个关联。',
  paragraphs: [...],          // 剧情文字（沿用 scene 的段落风格）
  clue: { title, text },      // 可与线索本联动（可选）
  controls: [
    { kind:'choice', id:'designType', label:'研究设计类型',
      options:[{value:0,label:'横断面'},{value:1,label:'病例对照'},{value:2,label:'队列'}],
      default: 0 },
    { kind:'range',  id:'sampleSize', label:'样本量',
      min:100, max:10000, step:100, default:1000, unit:'人' }
  ],
  metrics: [ {id:'bias', label:'偏倚风险', direction:'lower'}, ... ],
  rulesId: 'hbv-l1',          // 指向 designRules 中的公式集
  hint: { text: '…', events:[...] },   // 复用既有 hint 机制
  feedback: { /* 由 rules.judge 产出，或数据侧兜底 */ }
}
```

要点：
- **`id` 必须稳定**，它是 `answers[id]` 的键，撑起存档 / 多标签合并 / 续玩回填。
- `controls` 用声明式描述，视图层据此生成控件，公式层只吃 `params` 对象，未来加关卡不用改视图代码。
- 指标 `direction` 决定"越低越好/越高越好"，仅影响配色与文案。

### 答题记录如何落到既有 schema

优先**复用**现有字段，避免动存档校验：

| 概念 | 复用字段 | 说明 |
| --- | --- | --- |
| 用过关卡 | `attempts` 含答案 id | 设计面板的"答案 id"可约定为固定串（如 `'pass'`），首次提交达标即写入 |
| 提交次数 | `attempts` 去重后长度 | >1 视为"纠错后答对"→ 计 60 |
| 看过提示 | `acknowledged` | 计 30 |
| 参数留痕 | `events[]` 追加 `{id, kind:'design', params:{…}}` | 用于续玩回填，且 `Ne` 已按 id+JSON 去重 |

⚠️ 需先确认 `Oe()/Ee()` 存档校验是否接受 `events.kind='design'` 与未知字段；若不允许，则退化为只在组件内记忆参数（不落盘具体值，只落"是否通过"）。

---

## 5. 评分与兼容（核心）

### 5.1 双层评分

- **面板内即时分（0–100）**：由 `judge()` 给出，用于实时反馈与"结果正确程度"体验。**不进总榜**。
- **章节总榜分**：仍走 `(100f+60r+30h)/total`。设计面板按"通过与否"归入 f/r/h：

```
首提交即落在正确区间            → f（100%）
经 ≥1 次错误提交后落在正确区间  → r（60%）
只有在查看提示后才达标          → h（30%）
```

这样设计面板就是"一道题"，语义与既有体系一致，社区快照校验无需改公式。

### 5.2 `totalQuestions` 的迁移问题（必须决策）

- 若把这 5 个设计面板**并入现有章节**：该章 `Il[chapter] += 5`。副作用是历史投稿的 `totalQuestions` 不再匹配，会被社区校验丢弃（直到快照重算）。⚠️
- 若**新建一章 `hbv`**：需同步更新 ① 章节白名单 ② `Il` 增加 `hbv` 条目 ③ 章节元数据 ④ 社区快照生成器与社区 README。影响面更大但更干净。

**建议**：新建独立章节 `hbv`，与现有 10 章并列，避免污染已上线章节的历史成绩。

---

## 6. 公式规范化与问题清单

思路二的公式在**边界与量纲**上有若干硬伤，直接照抄会算错。规范化约定：所有 0–100 指标 **clamp(x,0,100)**；覆盖率/比例统一归一到 `[0,1]`；分档边界用 `≥/≤` 显式写死。

| 关卡 | 文档公式 | 问题 | 规范化建议 |
| --- | --- | --- | --- |
| 1 发现关联 | `bias = base − (N/10000)×10`，`conf = 100 − bias` | 基本自洽；队列+N≥5000 ⇒ conf≥90，与正确区间一致 | 直接 clamp 即可 |
| 2 控制混杂 | `risk = 80 − 20×真因 + 5×吸烟 − 5×(匹配/10)` | 勾满 3 项+匹配≥70 ⇒ **−15，为负**；且匹配≥40 就已归零，与"匹配≥70"判据不自洽 | clamp 到 [0,100]；**重新标定权重**（如每真因 −15、匹配项非线性），或把正确判据改为"残余风险 ≤ 10" |
| 3 剂量-反应 | `p = 0.05 − (随访/30)×0.04` | 随访∈[5,30] ⇒ p∈[0.0433,0.01]，**恒定 <0.05，趋势永远显著**，公式失效 | 改为两维：`p = clamp(0.10 − (随访/30)×0.07 − 阈值档权重, 0.001, 0.5)`，使短随访/高阈值时 p>0.05 |
| 4 干预验证 | `下降 = 覆盖率×(随访/40)×70` | 覆盖率滑块是 0–100%，需 ÷100；分档边界（=50、=80、=20）未定义 | 归一化覆盖率；分档用 `≥/<` 明确 |
| 5 机制补充 | `完整度 = 30×勾选数 + 5×(深度/10)` | 最大 `3×30 + 10×5 = 140`，**超 100**；深度/10 未说明是否取整 | clamp 到 100；(深度/10) 建议取整或连续化需定 |

**统一建议**：所有关卡对外暴露同构接口
```
compute(rulesId, params) -> metrics: { id, value, label, unit }[]
judge(rulesId, params)   -> { score:0..100, pass:boolean, messages: {level:'info'|'warn', text}[] }
```
`pass` 由"是否落在正确区间"判定，`messages` 承载思路二里逐条反馈（漏选黄曲霉毒素 / 勾了吸烟 / 随访过短 …）。

---

## 7. 视图层（DesignPanel）

布局沿用思路二：**上=剧情文字，中=参数区，下=实时指标 + 反馈，底=提交/重做**。实现要点：

- **实时**：控件 `onChange` → `setParams` → 渲染期调用 `compute()`（纯函数，可缓存）。
- **提交/重做**：首次提交达标 → 走 `f`；未达标 → 展示 `judge().messages`，允许重做（累计 `attempts`）。
- **提示**：复用既有 hint 面板与音频按钮。
- **无障碍（强约束）**：
  - `range` 必须给 `aria-valuetext`（带单位与语义，如"样本量 5000 人"），不能只靠滑块位置读数；
  - 勾选框用真实 `input[type=checkbox]` + `<label>`；
  - 指标变化用 `aria-live="polite"` 播报；
  - 键盘可达，焦点环沿用既有 `#a65a30` 样式。
- **降级**：插画/音频加载失败时照常可玩（沿用现有降级策略）。
- **双阅读模式**：设计面板在"故事模式 / 简洁阅读"下都要工作，不引入额外停顿式互动。

---

## 8. 状态与持久化

- 复用 `socrates-comic-<chapter>-v<n>` 键；设计面板的通过状态与参数留痕并入同一份 state（见 §4）。
- 续玩时按 `answers[id]` 回填已提交参数与结论。
- 多标签合并（`Ne`）与"已完成取更早 completedAt"逻辑无需改动，前提是记录只落在既有字段上。
- 失败提示（`saveFailed`）沿用。

---

## 9. 声音与线索本

- 反馈文案若配语音，需新增 `audio-manifest.js` 条目（`speechText/durationSeconds/sha256`），**渲染前需重新生成 manifest**；建议列为本期可选（Phase 2）。
- 关键结论可写入线索本（`clue`）与"倾向/回望"（不计分），与现有叙事机制一致。

---

## 10. 落地阶段

**Phase 0 — 前置确认（阻塞项）**
1. ⚠️ 拿到**可读源码工程**（打包前的 Vite/React 仓库）。当前只有压缩产物，无法直接改面板类型与公式。
2. ⚠️ 确认 `Oe/Ee` 存档校验是否允许 `events.kind='design'` 与附加字段。
3. ⚠️ 决定：并入现有章节 vs 新建 `hbv` 章节（影响排行榜历史成绩）。

**Phase 1 — 领域逻辑（可离线开发）**
- 实现 `designRules`（5 套 `compute/judge` + 单测），先把 §6 的公式问题修好、把边界定死。

**Phase 2 — 面板类型与视图**
- panel 数据模型加 `design`；实现 `DesignPanel` 组件；接答题 reducer（f/r/h）；无障碍与降级。

**Phase 3 — 内容与章节接线**
- 写 5 关剧情文字与反馈文案；新章节元数据；更新 `Il`、章节白名单、社区快照生成器与 README。

**Phase 4 — 验收**
- 单测（公式边界）、存档迁移回归、多标签合并回归、排行榜口径回归、a11y 检查（键盘 + 屏幕阅读器）。

---

## 11. 风险与开放问题（汇总）

| # | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| R1 | 无源码，只有压缩产物 | **阻塞**：无法加面板类型 | 先取源码工程；若确实没有，则需新建独立页面并以 iframe/路由接入（体验与存档会割裂，不推荐） |
| R2 | `totalQuestions` 是常量且被社区校验 | 历史成绩可能失效 | 新建章节而非并入 |
| R3 | 三处公式存在负值/超 100/恒显著 | 计算错误、体验失真 | 按 §6 规范化 + 重新标定 |
| R4 | 存档 schema 校验/合并字段未知 | 可能丢进度 | Phase 0 验证后再定落盘方案 |
| R5 | a11y 强约束（读数不能只靠视觉） | 合规 | 控件 + aria-valuetext + aria-live |
| R6 | 新章节需改快照生成器 | 榜单 | 与应用同 PR 一起改 |

---

## 附：给实现者的最小接口约定

```js
// designRules.js
export function compute(rulesId, params) { /* -> [{id,value,label,unit}] */ }
export function judge(rulesId, params) {
  // -> { score: 0..100, pass: boolean, messages: [{level, text}] }
}
```
- `compute` 纯函数、无副作用、可缓存。
- `judge` 不依赖 UI；`pass` 决定计入 f（首提交）/r（重做）/h（看过提示）。
- 所有 0–100 指标出口统一 clamp；比例输入统一归一化到 [0,1]。
