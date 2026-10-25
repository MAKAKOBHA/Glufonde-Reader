/*
 * Мини-парсер Markdown для читалки Glufonde Fracture.
 * Работает без сервера и без внешних библиотек. Весь текст экранируется,
 * необработанный HTML в главах не поддерживается (кроме переноса <br> в ячейках таблиц).
 *
 * Поддерживается:
 *   # Название главы      ## Раздел      ### Подраздел      #### Мелкий заголовок
 *   абзацы, списки "- " и "1. ", **жирный**, *курсив*, [ссылка](адрес)
 *   таблицы в формате | a | b |
 *   ![описание](assets/img/файл.png)
 *   блоки: ::: example / ::: note / ::: important / ::: formula  ...  :::
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GFMarkdown = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ESC[c]; }); }

  var STAR = '\u0001';
  var STAR_RE = new RegExp(STAR, 'g');

  function isSafeLink(u) {
    u = u.trim();
    if (/^(https?:|mailto:)/i.test(u)) return true;
    if (u.charAt(0) === '#') return true;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return false; // javascript:, data: и т.п.
    return !/(^\/|\.\.|\\)/.test(u);
  }
  function isSafeAsset(u) {
    u = u.trim();
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return false;
    return !/(^\/|\.\.|\\)/.test(u);
  }

  function inline(src, allowBr) {
    var s = String(src).replace(/\\\*/g, STAR);
    s = esc(s);
    if (allowBr) s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, text, url) {
      var raw = url.replace(/&amp;/g, '&');
      if (!isSafeLink(raw)) return text;
      var ext = /^https?:/i.test(raw);
      return '<a href="' + url + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + text + '</a>';
    });
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return s.replace(STAR_RE, '*');
  }

  function plain(src) {
    return String(src)
      .replace(/\\\*/g, STAR)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(STAR_RE, '*')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(t) {
    var s = plain(t).toLowerCase().replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    return s || 'razdel';
  }

  function splitRow(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\') s = s.slice(0, -1);
    return s.split('|').map(function (c) { return c.trim(); });
  }

  var RE_HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
  var RE_UL = /^\s*[-•]\s+/;
  var RE_OL = /^\s*\d+[.)]\s+/;
  var RE_IMG = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  var RE_TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
  var RE_CONT = /^:::\s*([A-Za-z]+)\s*(.*)$/;
  var RE_CONT_END = /^:::\s*$/;
  var RE_HR = /^\s*-{3,}\s*$/;

  var CALLOUT_TITLES = { example: 'Пример', note: 'Примечание', important: 'Важно!' };

  function addBlock(ctx, text, kind) {
    var id = ctx.counter++;
    ctx.blocks.push({ id: id, text: text, heading: ctx.curHeading, kind: kind });
    return id;
  }

  function startsBlock(line) {
    return !line.trim() || RE_HEADING.test(line) || RE_UL.test(line) || RE_OL.test(line) ||
      RE_IMG.test(line) || RE_CONT.test(line) || /^\s*\|/.test(line);
  }

  function parseBlocks(lines, ctx, nested) {
    var out = [];
    var i = 0, n = lines.length;
    while (i < n) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }

      // Контейнеры ::: тип Заголовок
      var cm = RE_CONT.exec(line);
      if (cm && !nested) {
        var type = cm[1].toLowerCase(), title = cm[2].trim();
        var inner = [];
        i++;
        while (i < n && !RE_CONT_END.test(lines[i])) { inner.push(lines[i]); i++; }
        if (i >= n) ctx.warnings.push('Блок ::: ' + type + ' не закрыт (нет строки :::)');
        else i++;
        if (type === 'formula') {
          var ftxt = inner.join(' ').trim();
          var fid = addBlock(ctx, plain(ftxt), 'formula');
          out.push('<div class="formula" data-b="' + fid + '">' + inline(ftxt) + '</div>');
        } else {
          if (!CALLOUT_TITLES[type]) { ctx.warnings.push('Неизвестный тип блока ::: ' + type + ' (использован note)'); type = 'note'; }
          var ctitle = title || CALLOUT_TITLES[type];
          var body = parseBlocks(inner, ctx, true);
          out.push('<aside class="callout callout--' + type + '"><p class="callout__title">' + esc(ctitle) +
            '</p><div class="callout__body">' + body + '</div></aside>');
        }
        continue;
      }

      // Заголовки
      var hm = RE_HEADING.exec(line);
      if (hm) {
        var level = hm[1].length, raw = hm[2], text = plain(raw), id;
        if (level === 1 && !ctx.title) { ctx.title = text; id = 'top'; }
        else {
          var base = slugify(text);
          ctx.used[base] = (ctx.used[base] || 0) + 1;
          id = ctx.used[base] > 1 ? base + '-' + ctx.used[base] : base;
        }
        ctx.curHeading = id;
        ctx.curHeadingText = text;
        ctx.headings.push({ level: level, text: text, id: id });
        var bid = addBlock(ctx, text, 'h' + level);
        var inner1;
        var lm = level === 1 ? /^(Глава\s+[IVXLCDM]+\.)\s+(.+)$/.exec(raw) : null;
        if (lm) inner1 = '<span class="chapter-label">' + esc(lm[1]) + '</span> <span class="chapter-name">' + inline(lm[2]) + '</span>';
        else inner1 = inline(raw);
        out.push('<h' + level + ' id="sec-' + id + '" data-b="' + bid + '"' + (level === 1 ? ' class="chapter-title" tabindex="-1"' : '') + '>' + inner1 + '</h' + level + '>');
        i++;
        continue;
      }

      // Горизонтальная линия
      if (RE_HR.test(line) && !RE_UL.test(line)) { out.push('<hr>'); i++; continue; }

      // Изображение
      var im = RE_IMG.exec(line);
      if (im) {
        var alt = im[1].trim(), src = im[2].trim();
        if (!isSafeAsset(src)) { ctx.warnings.push('Небезопасный путь к изображению: ' + src); i++; continue; }
        out.push('<figure class="figure" data-src="' + esc(src) + '"><img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy">' +
          '<div class="figure__missing" hidden><p class="figure__missing-title">Изображение пока не добавлено</p>' +
          '<p class="figure__missing-alt">' + esc(alt) + '</p><p class="figure__missing-file">Файл: <code>' + esc(src) + '</code></p></div></figure>');
        i++;
        continue;
      }

      // Таблица
      if (/^\s*\|/.test(line) && i + 1 < n && RE_TABLE_SEP.test(lines[i + 1])) {
        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < n && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        var labels = head.map(plain);
        var stack = head.length >= 4;
        // Формат каталога Эйдосов: имя в шапке, 3 стадии, описание и эффект.
        // Выводим рядом отдельное мобильное представление с сохранением
        // исходной таблицы для компьютеров. Все значения берутся из Markdown.
        var isEidosStages = head.length === 3 && rows.length === 3 &&
          ['Сомнение', 'Изучение', 'Осознание'].every(function (stage, j) {
            return plain(rows[0][j] || '').toLowerCase() === stage.toLowerCase();
          });
        var hid = addBlock(ctx, labels.join(' · '), 'th');
        var t = '<div class="table-wrap" role="region" tabindex="0" aria-label="Таблица: ' + esc(ctx.curHeadingText || '') + '">' +
          '<table class="table' + (stack ? ' table--stack' : '') + '"><thead><tr data-b="' + hid + '">';
        head.forEach(function (h) { t += '<th scope="col">' + inline(h, true) + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function (r) {
          if (r.length !== head.length) ctx.warnings.push('Таблица «' + (ctx.curHeadingText || '') + '»: в строке «' + plain(r[0] || '') + '» ' + r.length + ' ячеек вместо ' + head.length);
          var rid = addBlock(ctx, r.map(plain).join(' · '), 'tr');
          t += '<tr data-b="' + rid + '">';
          for (var c = 0; c < head.length; c++) {
            var cell = r[c] == null ? '' : r[c];
            var lab = labels[c] ? ' data-label="' + esc(labels[c]) + '"' : '';
            if (c === 0) t += '<th scope="row"' + lab + '>' + inline(cell, true) + '</th>';
            else t += '<td' + lab + '>' + inline(cell, true) + '</td>';
          }
          t += '</tr>';
        });
        t += '</tbody></table></div>';
        if (isEidosStages) {
          var mobile = '<div class="eidos-mobile" aria-label="Стадии Эйдоса: ' +
            esc(labels[0] || ctx.curHeadingText || '') + '">';
          mobile += '<div class="eidos-mobile__title">' + inline(head[0]) + '</div>';
          rows[0].forEach(function (stage, j) {
            var description = rows[1][j] || '';
            var effect = rows[2][j] || '';
            mobile += '<section class="eidos-mobile__stage">' +
              '<h4 class="eidos-mobile__stage-name">' + inline(stage) + '</h4>' +
              '<div class="eidos-mobile__description">' + inline(description, true) + '</div>' +
              '<div class="eidos-mobile__effect-label">Эффект</div>' +
              '<div class="eidos-mobile__effect">' + inline(effect, true) + '</div>' +
              '</section>';
          });
          mobile += '</div>';
          t = t.replace('</table></div>', '</table>' + mobile + '</div>');
          t = t.replace('class="table-wrap"', 'class="table-wrap table-wrap--eidos"');
        }
        out.push(t);
        continue;
      }

      // Списки
      var ul = RE_UL.test(line), ol = !ul && RE_OL.test(line);
      if (ul || ol) {
        var re = ul ? RE_UL : RE_OL;
        var items = [];
        while (i < n && re.test(lines[i])) { items.push(lines[i].replace(re, '')); i++; }
        var tag = ul ? 'ul' : 'ol';
        out.push('<' + tag + '>' + items.map(function (it) {
          var lid = addBlock(ctx, plain(it), 'li');
          return '<li data-b="' + lid + '">' + inline(it) + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }

      // Абзац
      var para = [line.trim()];
      i++;
      while (i < n && !startsBlock(lines[i])) { para.push(lines[i].trim()); i++; }
      var ptxt = para.join(' ');
      var pid = addBlock(ctx, plain(ptxt), 'p');
      out.push('<p data-b="' + pid + '">' + inline(ptxt) + '</p>');
    }
    return out.join('\n');
  }

  function render(src) {
    var lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    var ctx = { headings: [], blocks: [], used: {}, counter: 0, curHeading: 'top', curHeadingText: '', title: '', warnings: [] };
    var html = parseBlocks(lines, ctx, false);
    return { title: ctx.title, html: html, headings: ctx.headings, blocks: ctx.blocks, warnings: ctx.warnings };
  }

  return { render: render, plain: plain, slugify: slugify, esc: esc };
});
