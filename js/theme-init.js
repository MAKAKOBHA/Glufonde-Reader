/*
 * Применяет сохранённые настройки (тема, размер текста, ширина колонки, интервал)
 * сразу при загрузке страницы, чтобы не было «мигания». Подключается в <head>
 * на index.html и license.html.
 */
(function (root) {
  'use strict';
  var DEFAULTS = { theme: 'dark', fontScale: 100, measure: 720, lineHeight: 1.7, sidebar: true,
    fontBody: 'default', fontHeading: 'default', ambOn: true, ambVolume: 40 };
  var LIMITS = { fontScale: [80, 160], measure: [520, 960], ambVolume: [0, 100] };

  function clamp(v, lim, def) {
    v = Number(v);
    if (!isFinite(v)) return def;
    return Math.min(lim[1], Math.max(lim[0], v));
  }

  function fid(v) {
    return (root.GFFonts ? root.GFFonts.valid(v) : v === 'default') ? v : 'default';
  }

  function sanitize(s) {
    s = s || {};
    return {
      theme: (s.theme === 'light' || s.theme === 'auto') ? s.theme : 'dark',
      fontScale: clamp(s.fontScale, LIMITS.fontScale, DEFAULTS.fontScale),
      measure: clamp(s.measure, LIMITS.measure, DEFAULTS.measure),
      lineHeight: [1.5, 1.7, 1.9].indexOf(Number(s.lineHeight)) !== -1 ? Number(s.lineHeight) : DEFAULTS.lineHeight,
      sidebar: s.sidebar !== false,
      ambOn: s.ambOn !== false,
      ambVolume: clamp(s.ambVolume, LIMITS.ambVolume, DEFAULTS.ambVolume),
      fontBody: fid(s.fontBody),
      fontHeading: fid(s.fontHeading)
    };
  }

  function apply(s) {
    var el = document.documentElement;
    el.setAttribute('data-theme', s.theme);
    el.style.setProperty('--fs-scale', String(s.fontScale / 100));
    el.style.setProperty('--measure', s.measure + 'px');
    el.style.setProperty('--lh', String(s.lineHeight));
    if (root.GFFonts) root.GFFonts.apply(s);
  }

  function load() {
    return sanitize(root.GFStorage ? root.GFStorage.get('settings', null) : null);
  }

  root.GFTheme = { DEFAULTS: DEFAULTS, LIMITS: LIMITS, sanitize: sanitize, apply: apply, load: load };
  apply(load());
})(window);
