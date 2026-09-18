/* =========================================================================
 * store.js — 本地存档层
 * 仅保存在本机浏览器，不上传。schema 为本项目自定义（可自由扩展字段）。
 * ========================================================================= */
(function (root) {
  'use strict';

  const KEY = 'causal-lab-save-v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false; // 隐私模式 / 配额不足时静默降级
    }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  root.SQ = root.SQ || {};
  root.SQ.store = { load, save, clear, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
