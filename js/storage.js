/*
 * Безопасная обёртка над localStorage.
 * Если браузер запрещает хранилище (приватный режим, блокировка), читалка продолжает работать,
 * просто ничего не запоминает между визитами. Данные хранятся только на вашем устройстве.
 */
(function (root) {
  'use strict';
  var PREFIX = 'gf:';
  var mem = {};
  var ls = null;
  var persistent = false;
  try {
    ls = root.localStorage;
    var probe = '__gf_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    persistent = true;
  } catch (e) { ls = null; persistent = false; }

  function get(key, fallback) {
    try {
      var raw = persistent ? ls.getItem(PREFIX + key) : mem[key];
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function set(key, value) {
    var raw = JSON.stringify(value);
    mem[key] = raw;
    if (!persistent) return false;
    try { ls.setItem(PREFIX + key, raw); return true; }
    catch (e) { persistent = false; return false; }
  }
  function remove(key) {
    delete mem[key];
    try { if (persistent) ls.removeItem(PREFIX + key); } catch (e) { /* ничего */ }
  }

  root.GFStorage = { get: get, set: set, remove: remove, isPersistent: function () { return persistent; } };
})(window);
