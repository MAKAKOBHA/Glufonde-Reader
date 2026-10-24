/*
 * Локальный поиск по книге. Ничего не отправляется в интернет.
 * Индекс строится в памяти при первом поиске из уже разобранных глав.
 * Поиск не учитывает регистр и считает «е» и «ё» одной буквой.
 * Ищет по частям слов: запрос «стрел» найдёт «стрельба», «стрелять».
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GFSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }

  function tokens(q) {
    return norm(q).split(/[\s,.;:!?«»"“”()\[\]]+/).filter(function (t) { return t.length > 0; });
  }

  function build(chapters) {
    var entries = [];
    chapters.forEach(function (ch, ci) {
      var headText = {};
      ch.headings.forEach(function (h) { headText[h.id] = h.text; });
      ch.blocks.forEach(function (b) {
        entries.push({
          c: ci, b: b.id, kind: b.kind, text: b.text, n: norm(b.text),
          section: b.heading, sectionText: headText[b.heading] || ch.title
        });
      });
    });
    return entries;
  }

  // Диапазоны совпадений токенов в нормализованном тексте (слитые, по порядку)
  function ranges(normText, toks) {
    var r = [];
    toks.forEach(function (t) {
      if (!t) return;
      var from = 0, idx;
      while ((idx = normText.indexOf(t, from)) !== -1) { r.push([idx, idx + t.length]); from = idx + t.length; }
    });
    r.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
    var merged = [];
    r.forEach(function (x) {
      var last = merged[merged.length - 1];
      if (last && x[0] <= last[1]) { if (x[1] > last[1]) last[1] = x[1]; }
      else merged.push([x[0], x[1]]);
    });
    return merged;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // HTML-фрагмент с подсветкой совпадений вокруг первого вхождения
  function snippet(text, toks, radius) {
    radius = radius || 70;
    var nt = norm(text), rs = ranges(nt, toks);
    var first = rs.length ? rs[0][0] : 0;
    var start = Math.max(0, first - radius);
    var end = Math.min(text.length, first + radius * 2);
    if (start > 0) { var sp = text.indexOf(' ', start); if (sp !== -1 && sp < first) start = sp + 1; }
    if (end < text.length) { var sp2 = text.lastIndexOf(' ', end); if (sp2 > first) end = sp2; }
    var html = '', pos = start;
    rs.forEach(function (r) {
      if (r[1] <= start || r[0] >= end) return;
      var a = Math.max(r[0], start), b = Math.min(r[1], end);
      html += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>';
      pos = b;
    });
    html += esc(text.slice(pos, end));
    return (start > 0 ? '… ' : '') + html + (end < text.length ? ' …' : '');
  }

  function search(entries, query, limit) {
    var q = norm(query).trim();
    var toks = tokens(query);
    if (!q || !toks.length) return { status: 'empty', toks: [], results: [], total: 0 };
    var found = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], ok = true;
      for (var t = 0; t < toks.length; t++) { if (e.n.indexOf(toks[t]) === -1) { ok = false; break; } }
      if (!ok) continue;
      var score = 0;
      if (e.n.indexOf(q) !== -1) score += 4;
      if (/^h\d$/.test(e.kind)) score += 3;
      if (e.n.indexOf(toks[0]) === 0) score += 1;
      found.push({ e: e, score: score, order: i });
    }
    found.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    var total = found.length;
    limit = limit || 100;
    return {
      status: total ? 'ok' : 'none',
      toks: toks,
      total: total,
      results: found.slice(0, limit).map(function (f) { return f.e; })
    };
  }

  return { norm: norm, tokens: tokens, build: build, search: search, snippet: snippet, ranges: ranges };
});
