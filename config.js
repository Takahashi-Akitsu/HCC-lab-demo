/* =========================================================================
 * config.js — 项目配置（改这里就能调整全局行为）
 * ========================================================================= */
(function (root) {
  'use strict';
  root.SQ = root.SQ || {};

  root.SQ.config = {
    /* 图片位开关：
     *   true  = 没填图片的槽位会显示虚线占位框，提醒你该往哪放图（制作阶段用）
     *   false = 只显示已填写的图片，空槽位完全隐藏（发布前设成 false 更整洁）
     */
    showImagePlaceholders: false,

    /* 首通模式（书架页「盲盒模式」开关，可随时手动切换）：
     *   true  = 默认开启：首次游玩期间不显示「设计得分」，改由左侧角色的表情
     *           提示你的设计是否偏离区间；首次完成一关后自动切回关闭。
     *   false = 默认关闭，全程实时显示设计得分。
     *   玩家在书架页的手动开关会覆盖这里的默认值（存在本机存档里）。
     */
    blindBoxDefault: true,

    /* 是否在关卡页显示左侧角色 */
    showCharacter: true,
    topReminder: false,        // true = 不显示角色，改在网页正上方悬挂提醒条（见 no-character.html）

    /* 图片根目录（写 src 时可以省略这个前缀） */
    imageBase: 'assets/levels/'
  };
})(typeof window !== 'undefined' ? window : globalThis);
