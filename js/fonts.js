/*
 * Смена шрифтов заголовков и основного текста.
 * Список шрифтов берётся из assets/fonts/fonts.js (window.GF_FONTS).
 * Подключается в <head> до theme-init.js, чтобы шрифт применялся сразу, без «мигания».
 *
 *   GFFonts.list()                         — все шрифты
 *   GFFonts.valid(id)                      — есть ли такой id
 *   GFFonts.apply({fontBody, fontHeading}) — применить (ставит CSS-переменные --font-body и --font-head)
 *   GFFonts.fill(selectElement, selectedId)— заполнить выпадающий список
 */
(function (root) {
  'use strict';
  var FALLBACK = [{ id: 'default', name: 'Как в PDF (Times New Roman)', stack: "'Times New Roman', Times, serif" }];

  function list() {
    var l = root.GF_FONTS;
    return (l && l.length) ? l : FALLBACK;
  }
  function find(id) {
    var l = list();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function valid(id) { return typeof id === 'string' && !!find(id); }

  function apply(s) {
    var el = document.documentElement;
    var body = find(s && s.fontBody) || list()[0];
    var head = find(s && s.fontHeading) || list()[0];
    el.style.setProperty('--font-body', body.stack);
    el.style.setProperty('--font-head', head.stack);
    // шрифты, которые страница ещё не использовала, браузер загрузит сам при первом показе
  }

  function fill(select, selected) {
    if (!select) return;
    select.textContent = '';
    list().forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      o.style.fontFamily = f.stack;
      select.appendChild(o);
    });
    select.value = valid(selected) ? selected : list()[0].id;
  }

  root.GFFonts = { list: list, valid: valid, apply: apply, fill: fill };
})(window);
