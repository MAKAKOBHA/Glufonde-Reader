/*
 * Логика читалки: маршруты, оглавление, чтение, поиск, закладки, настройки.
 * Все адреса относительные и используют «#», поэтому читалка работает и в корне сайта,
 * и в подпапке GitHub Pages (username.github.io/repository/), и просто из файла.
 */
(function () {
  'use strict';

  var CFG = window.GF_CONFIG || {};
  var BOOK = window.GF_BOOK;
  var MD = window.GFMarkdown, SEARCH = window.GFSearch, STORE = window.GFStorage, THEME = window.GFTheme;
  var FONTS = window.GFFonts, AMB = window.GFAmbience;

  var $ = function (id) { return document.getElementById(id); };
  var els = {};
  ['home', 'reader', 'article', 'pager', 'toc', 'crumb', 'progress', 'progress-bar', 'sidebar', 'backdrop', 'main',
    'search-form', 'search-input', 'search-status', 'search-results', 'bookmarks', 'bookmarks-hint',
    'btn-menu', 'btn-prev', 'btn-next', 'btn-search', 'btn-bookmark', 'btn-settings', 'settings', 'sr-status',
    'hl-bar', 'hl-text', 'hl-clear', 'to-toc', 'btn-read', 'btn-continue', 'continue-title', 'home-meta',
    'home-toc', 'home-search', 'home-settings', 'settings-note', 'settings-reset', 'topbar', 'btn-lore', 'btn-ambience', 'booknav', 'amb-status', 'amb-toggle', 'set-volume', 'out-volume'
  ].forEach(function (id) { els[id] = $(id); });

  var settings = THEME.load();
  var gmMode = STORE.get('gm-mode', false) === true;
  var chapters = [];           // главы текущего раздела
  var books = {};              // id раздела -> { id, title, ambience, chapters }
  var bookId = 'rules';        // текущий раздел
  var current = null;          // { ch, index }
  var activeSection = 'top';
  var resumeY = null;          // позиция для кнопки «Продолжить»
  var resumeBlock = null;      // блок, с которого продолжить чтение
  var pendingHL = null;        // { tokens, block }
  var searchIndex = null;
  var lastQuery = '';
  var expanded = {};           // id главы -> развёрнута ли в оглавлении
  var scrollTimer = null, ticking = false;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var loreMode = STORE.get('lore-mode', 'full') === 'short' ? 'short' : 'full';
  var splitMode = false, splitFocused = 'rules';
  var splitPositions = STORE.get('split-positions', {}) || {};
  var readingTrail = [];
  var suppressTrail = false, returnPosition = null, splitScrollSaveTimer = null;

  function announce(msg) { els['sr-status'].textContent = ''; setTimeout(function () { els['sr-status'].textContent = msg; }, 30); }
  function isMobile() { return window.matchMedia('(max-width: 899px)').matches; }

  // На iOS чтение прокручивается в .content, а не в корневом документе.
  // Остальные браузеры продолжают использовать обычную прокрутку окна.
  function hasReaderScroller() {
    return document.body.dataset.view === 'reader' &&
      window.getComputedStyle(els.main).overflowY === 'auto';
  }
  function readerScrollY() {
    return hasReaderScroller() ? els.main.scrollTop : window.pageYOffset;
  }
  function readerScrollTo(top, behavior) {
    var opts = { top: Math.max(0, top), behavior: behavior || 'auto' };
    if (hasReaderScroller()) els.main.scrollTo(opts);
    else window.scrollTo(opts);
  }

  /* ---------- Подготовка книги ---------- */
  function bookMeta(id) {
    var d = { rules: { title: 'RuleBook', ambience: '' }, lore: { title: 'История Глюфонде', ambience: '' } };
    var m = (CFG.books && CFG.books[id]) || {};
    return { title: m.title || d[id].title, ambience: m.ambience || d[id].ambience };
  }
  // Блоки между :::master и ::: видны только в режиме Мастера.
  function visibleMarkdown(source) {
    return String(source || '').replace(/^:::master\s*\n([\s\S]*?)^:::\s*$/gm, function (all, inner) {
      return gmMode ? inner : '';
    });
  }
  // Временная сокращённая версия существующих статей: первые два смысловых
  // блока каждого раздела. Позднее редакторские shortMd заменят эти выдержки.
  // Заголовки и цельные Markdown-блоки сохраняются.
  function makeShortLore(text) {
    var chunks = String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
    var count = 0, out = [];
    chunks.forEach(function (chunk) {
      var c = chunk.trim();
      if (!c) return;
      if (/^#{1,6}\s/m.test(c)) {
        count = 0;
        out.push(c);
      } else if (count < 2) {
        out.push(c);
        count++;
      }
    });
    return out.join('\n\n');
  }
  // Превращает Markdown глав в готовые страницы. prefix нужен, чтобы адреса глав разных разделов не совпадали.
  function prepBook(id, raw, prefix) {
    var meta = bookMeta(id);
    return { id: id, title: meta.title, ambience: meta.ambience, chapters: (raw || []).filter(function (c) { return gmMode || !c.master; }).map(function (c, i) {
      var text = visibleMarkdown(c.md);
      if (id === 'lore' && loreMode === 'short') {
        text = visibleMarkdown(c.shortMd || makeShortLore(c.md));
      }
      var r = MD.render(text);
      return { id: prefix + c.id, book: id, index: i, title: r.title || c.id, html: r.html, headings: r.headings, blocks: r.blocks };
    }) };
  }
  function prepare() {
    if (!BOOK || !BOOK.chapters) return false;
    books.rules = prepBook('rules', BOOK.chapters, '');
    var lore = window.GF_LORE;
    if (lore && lore.chapters && lore.chapters.length) books.lore = prepBook('lore', lore.chapters, 'lore-');
    chapters = books.rules.chapters;
    return chapters.length > 0;
  }
  function chapterById(id) {
    for (var b in books) { var l = books[b].chapters; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; }
    return null;
  }
  // Переключает читалку на другой раздел: своё оглавление, свой поиск, своя музыка
  function useBook(id) {
    bookId = id; chapters = books[id].chapters; searchIndex = null; expanded = {};
    buildToc();
    els['search-results'].textContent = '';
    els['search-status'].textContent = 'Введите слово или фразу.';
    var lbl = document.querySelector('.search__label'); if (lbl) lbl.textContent = 'Поиск: ' + books[id].title;
    els.toc.parentNode.setAttribute('aria-label', 'Оглавление: ' + books[id].title);
    renderBookNav();
  }
  function renderBookNav() {
    var nav = els.booknav; nav.textContent = '';
    Object.keys(books).forEach(function (id) {
      var a = document.createElement('a'); a.className = 'booknav__link'; a.textContent = books[id].title;
      a.href = hrefTo(books[id].chapters[0].id);
      if (id === bookId) { a.classList.add('is-current'); a.setAttribute('aria-current', 'true'); }
      nav.appendChild(a);
    });
  }
  function hrefTo(chId, secId) { return '#/read/' + chId + (secId && secId !== 'top' ? '/' + secId : ''); }

  /* ---------- Главный экран ---------- */
  function setText(id, text) { var e = $(id); if (e && text) e.textContent = text; }
  function fillHome() {
    document.title = CFG.title || 'Glufonde Fracture';
    setText('home-title', CFG.title); setText('home-tagline', CFG.tagline);
    els['btn-read'].textContent = books.rules.title; els['btn-read'].setAttribute('href', hrefTo(books.rules.chapters[0].id));
    if (books.lore) { els['btn-lore'].hidden = false; els['btn-lore'].textContent = books.lore.title; els['btn-lore'].setAttribute('href', hrefTo(books.lore.chapters[0].id)); }
    else els['btn-lore'].hidden = true;
    if (CFG.cover) $('home-cover').setAttribute('src', CFG.cover);
    var rows = [['Автор', CFG.author], ['Редактор', CFG.editor], ['Редакция', CFG.edition], ['Версия', CFG.version], ['Год', CFG.year]];
    els['home-meta'].textContent = '';
    rows.forEach(function (r) {
      if (!r[1]) return;
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.textContent = r[1];
      els['home-meta'].appendChild(dt); els['home-meta'].appendChild(dd);
    });
    var pos = STORE.get('position', null);
    var ch = pos && chapterById(pos.chapter);
    if (ch) {
      els['btn-continue'].hidden = false;
      els['btn-continue'].setAttribute('href', hrefTo(ch.id));
      els['continue-title'].textContent = (books[ch.book].title !== books.rules.title || books.lore ? books[ch.book].title + ' · ' : '') + ch.title;
    } else els['btn-continue'].hidden = true;
  }

  /* ---------- Оглавление ---------- */
  function buildToc() {
    els.toc.textContent = '';
    chapters.forEach(function (ch) {
      var subs = ch.headings.filter(function (h) { return h.level >= 2 && h.level <= 3; });
      var li = document.createElement('li'); li.className = 'toc__chapter'; li.dataset.ch = ch.id;
      var row = document.createElement('div'); row.className = 'toc__row';
      var a = document.createElement('a'); a.className = 'toc__link'; a.href = hrefTo(ch.id); a.dataset.ch = ch.id; a.dataset.sec = 'top';
      var m = /^(Глава\s+[IVXLCDM]+)\.\s+(.+)$/.exec(ch.title);
      if (m) {
        var n = document.createElement('span'); n.className = 'toc__num'; n.textContent = m[1];
        var t = document.createElement('span'); t.className = 'toc__name'; t.textContent = m[2];
        a.appendChild(n); a.appendChild(t);
      } else { var t2 = document.createElement('span'); t2.className = 'toc__name'; t2.textContent = ch.title; a.appendChild(t2); }
      row.appendChild(a);
      var ul = null;
      if (subs.length) {
        var tg = document.createElement('button'); tg.type = 'button'; tg.className = 'toc__toggle';
        tg.setAttribute('aria-label', 'Показать разделы: ' + ch.title);
        tg.setAttribute('aria-expanded', 'false');
        tg.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10l4 4 4-4"/></svg>';
        row.insertBefore(tg, a);
        ul = document.createElement('ul'); ul.className = 'toc__sub'; ul.hidden = true;
        subs.forEach(function (h) {
          var si = document.createElement('li');
          var sa = document.createElement('a'); sa.className = 'toc__link toc__link--l' + h.level;
          sa.href = hrefTo(ch.id, h.id); sa.dataset.ch = ch.id; sa.dataset.sec = h.id; sa.textContent = h.text;
          si.appendChild(sa); ul.appendChild(si);
        });
        tg.addEventListener('click', function () { setExpanded(ch.id, ul.hidden); });
      } else row.classList.add('toc__row--plain');
      li.appendChild(row); if (ul) li.appendChild(ul);
      els.toc.appendChild(li);
    });
  }
  function setExpanded(chId, open) {
    expanded[chId] = open;
    var li = els.toc.querySelector('li[data-ch="' + chId + '"]');
    if (!li) return;
    var ul = li.querySelector('.toc__sub'), tg = li.querySelector('.toc__toggle');
    if (ul) ul.hidden = !open;
    if (tg) tg.setAttribute('aria-expanded', open ? 'true' : 'false');
    li.classList.toggle('is-open', open);
  }
  function markTocActive() {
    var links = els.toc.querySelectorAll('.toc__link');
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      var on = current && l.dataset.ch === current.ch.id && l.dataset.sec === activeSection;
      l.classList.toggle('is-current', !!on);
      if (on && l.dataset.sec !== 'top') l.setAttribute('aria-current', 'location');
      else if (on) l.setAttribute('aria-current', 'page');
      else l.removeAttribute('aria-current');
    }
  }

  /* ---------- Маршрутизация ---------- */
  function parseHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/').map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } });
    if (parts[0] === 'read' && parts[1]) return { view: 'read', ch: parts[1], sec: parts[2] || 'top' };
    return { view: 'home' };
  }
  function route() {
    var r = parseHash();
    if (splitMode) {
      // Внешняя ссылка или кнопка перехода на главную выходит из двухоконного режима.
      splitMode = false;
      document.body.classList.remove('split-active');
      $('split-reader').hidden = true;
    }
    if (r.view === 'read') {
      var ch = chapterById(r.ch);
      if (!ch) { location.replace('#/'); return; }
      if (current && !els.reader.hidden && !suppressTrail &&
          (current.ch.id !== ch.id || r.sec !== activeSection)) {
        pushReadingTrail(captureReadingPosition());
      }
      suppressTrail = false;
      showReader(ch, r.sec);
    } else { suppressTrail = false; showHome(); }
  }
  function showHome() {
    var fromReader = !els.reader.hidden;
    saveScroll();
    closeDrawer();
    document.body.dataset.view = 'home';
    els.reader.hidden = true; els.home.hidden = false;
    updateReadingControls();
    if (AMB) AMB.setTrack(null);
    fillHome();
    document.title = CFG.title || 'Glufonde Fracture';
    window.scrollTo(0, 0);
    if (fromReader) { var t = els['btn-continue'].hidden ? els['btn-read'] : els['btn-continue']; t.focus({ preventScroll: true }); }
  }

  function showReader(ch, secId) {
    if (ch.book !== bookId) { saveScroll(); useBook(ch.book); current = null; }
    if (AMB) AMB.setTrack(books[bookId].ambience || null);
    var sameChapter = current && current.ch.id === ch.id && !els.reader.hidden;
    document.body.dataset.view = 'reader';
    els.home.hidden = true; els.reader.hidden = false;
    if (!sameChapter) {
      if (current) saveScroll();
      renderChapter(ch);
    }
    current = { ch: ch, index: ch.index };
    updateReadingControls();
    document.title = ch.title + ' — ' + books[bookId].title + ' — ' + (CFG.title || 'Glufonde Fracture');
    els.crumb.textContent = books[bookId].title + ' · ' + ch.title;
    updatePager(); markTocActive();
    var target = null;
    if (secId && secId !== 'top') target = document.getElementById('sec-' + secId);
    if (pendingHL) applyHighlight();
    if (returnPosition && returnPosition.chapter === ch.id) {
      // Возврат к точной позиции: значение scrollTop важнее заголовка.
      var yBack = returnPosition.y;
      returnPosition = null;
      readerScrollTo(yBack);
      activeSection = 'top';
    } else if (target) {
      scrollToEl(target, true);
      activeSection = secId;
    } else if (!sameChapter) {
      var rb = resumeBlock && els.article.querySelector('[data-b="' + resumeBlock + '"]');
      if (rb) scrollToEl(rb, true); else if (resumeY != null) readerScrollTo(resumeY); else readerScrollTo(0);
      resumeY = null; resumeBlock = null;
      activeSection = 'top';
      var h1 = els.article.querySelector('h1'); if (h1) h1.focus({ preventScroll: true });
    } else {
      readerScrollTo(0); activeSection = 'top';
    }
    expandFor(ch.id);
    updateActive(); markTocActive(); updateBookmarkBtn(); updateProgress();
    savePosition();
    if (isMobile()) closeDrawer();
  }
  function firstVisibleBlock() {
    var list = els.article.querySelectorAll('[data-b]'), top = els.topbar.offsetHeight + 8;
    for (var i = 0; i < list.length; i++) { if (list[i].getBoundingClientRect().bottom > top + 4) return list[i].getAttribute('data-b'); }
    return null;
  }
  function expandFor(chId) { if (!expanded[chId]) setExpanded(chId, true); }

  function renderChapter(ch) {
    els.article.innerHTML = ch.html;
    var figs = els.article.querySelectorAll('.figure');
    Array.prototype.forEach.call(figs, function (f) {
      var img = f.querySelector('img'), miss = f.querySelector('.figure__missing');
      function fail() { img.hidden = true; miss.hidden = false; f.classList.add('is-missing'); }
      img.addEventListener('error', fail);
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) { /* ещё грузится или ошибка */ if (img.complete) setTimeout(function () { if (img.naturalWidth === 0) fail(); }, 50); }
    });
  }

  function scrollToEl(el, instant) {
    var off = els.topbar.offsetHeight + 12;
    var y;
    if (hasReaderScroller()) {
      // Координаты внутри внутренней области чтения, уже под шапкой.
      y = el.getBoundingClientRect().top - els.main.getBoundingClientRect().top +
        els.main.scrollTop - 12;
    } else {
      y = el.getBoundingClientRect().top + window.pageYOffset - off;
    }
    readerScrollTo(y, (instant || reduceMotion) ? 'auto' : 'smooth');
    if (el.tagName && /^H[1-4]$/.test(el.tagName)) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); }
  }

  /* ---------- Предыдущая / следующая глава ---------- */
  function updatePager() {
    var i = current.index, prev = chapters[i - 1], next = chapters[i + 1];
    els.pager.textContent = '';
    function mk(ch, dir) {
      var a = document.createElement('a');
      a.className = 'pager__link pager__link--' + dir;
      if (!ch) { a.classList.add('is-empty'); a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; return a; }
      a.href = hrefTo(ch.id);
      var s = document.createElement('span'); s.className = 'pager__dir'; s.textContent = dir === 'prev' ? 'Назад' : 'Далее';
      var t = document.createElement('span'); t.className = 'pager__title'; t.textContent = ch.title;
      a.appendChild(s); a.appendChild(t); return a;
    }
    els.pager.appendChild(mk(prev, 'prev')); els.pager.appendChild(mk(next, 'next'));
    els['btn-prev'].disabled = !prev; els['btn-next'].disabled = !next;
  }
  function go(ch) { if (ch) location.hash = hrefTo(ch.id).slice(1); }

  /* ---------- Возврат к месту чтения ---------- */
  function captureReadingPosition() {
    if (!current) return null;
    return { book: current.ch.book, chapter: current.ch.id, section: activeSection,
      y: Math.max(0, readerScrollY()) };
  }
  function pushReadingTrail(frame) {
    if (!frame || !chapterById(frame.chapter)) return;
    var previous = readingTrail[readingTrail.length - 1];
    if (!previous || previous.chapter !== frame.chapter || Math.abs(previous.y - frame.y) > 8) {
      readingTrail.push(frame);
      if (readingTrail.length > 40) readingTrail.shift();
    }
    updateReadingControls();
  }
  function readingBack() {
    while (readingTrail.length) {
      var frame = readingTrail.pop();
      if (!chapterById(frame.chapter)) continue;
      if (splitMode) {
        var paneBook = frame.book;
        navigateSplit(paneBook, frame.chapter, frame.section, false, frame.y);
      } else {
        suppressTrail = true;
        returnPosition = frame;
        var hash = hrefTo(frame.chapter);
        if (location.hash === hash) route();
        else location.hash = hash;
      }
      break;
    }
    updateReadingControls();
  }
  function updateReadingControls() {
    $('btn-reading-back').disabled = readingTrail.length === 0;
    $('lore-switch').hidden = document.body.dataset.view !== 'reader' ||
      (!splitMode && bookId !== 'lore');
    $('lore-switch').classList.toggle('is-short', loreMode === 'short');
    $('lore-switch').setAttribute('aria-checked', loreMode === 'short' ? 'true' : 'false');
    $('lore-switch').setAttribute('aria-label', loreMode === 'short' ?
      'Сокращённая версия лора, переключить на полную' :
      'Полная версия лора, переключить на сокращённую');
    $('btn-split').setAttribute('aria-pressed', splitMode ? 'true' : 'false');
    $('btn-split').setAttribute('aria-label', splitMode ? 'Вернуться к одной книге' :
      'Читать RuleBook и лор рядом');
  }
  function changeLoreMode() {
    var oldY = !splitMode && current && current.ch.book === 'lore' ? readerScrollY() : null;
    loreMode = loreMode === 'full' ? 'short' : 'full';
    STORE.set('lore-mode', loreMode);
    books.lore = prepBook('lore', window.GF_LORE.chapters, 'lore-');
    if (splitMode) {
      saveSplitPositions();
      renderSplitPane('lore');
    } else if (bookId === 'lore') {
      var chId = current && current.ch.id;
      useBook('lore');
      current = null;
      resumeY = oldY;
      suppressTrail = true;
      if (chId && location.hash.indexOf('#/read/' + chId) === 0) route();
    }
    updateReadingControls();
  }
  /* ---------- Независимое чтение двух книг ---------- */
  function splitAvailable() {
    return window.matchMedia('(min-width: 1024px) and (orientation: landscape), (min-width: 1440px)').matches && !!books.lore;
  }
  function paneState(book) {
    var list = books[book] && books[book].chapters || [];
    var saved = splitPositions[book] || {};
    var valid = list.some(function (ch) { return ch.id === saved.chapter; });
    return valid ? saved : { chapter: list[0] && list[0].id, y: 0, section: 'top' };
  }
  function saveSplitPositions() {
    if (!splitMode) return;
    ['rules', 'lore'].forEach(function (book) {
      var panel = $('split-' + book + '-scroll');
      var state = paneState(book);
      splitPositions[book] = { chapter: state.chapter, section: state.section, y: panel.scrollTop };
    });
    STORE.set('split-positions', splitPositions);
  }
  function renderSplitPane(book) {
    var state = paneState(book), all = books[book].chapters;
    if (!state.chapter) return;
    var chapter = all.filter(function (ch) { return ch.id === state.chapter; })[0] || all[0];
    var article = $('split-' + book + '-article');
    var scroller = $('split-' + book + '-scroll');
    var nav = $('split-' + book + '-toc');
    $('split-' + book + '-title').textContent = chapter.title;
    article.innerHTML = chapter.html;
    nav.textContent = '';
    all.forEach(function (ch) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'split-toc__chapter' + (ch.id === chapter.id ? ' is-active' : '');
      button.textContent = ch.title;
      button.addEventListener('click', function () { navigateSplit(book, ch.id, 'top', true); });
      nav.appendChild(button);
      if (ch.id === chapter.id) ch.headings.filter(function (h) {
        return h.level >= 2 && h.level <= 3;
      }).forEach(function (h) {
        var sub = document.createElement('button');
        sub.type = 'button'; sub.className = 'split-toc__section';
        sub.textContent = h.text;
        sub.addEventListener('click', function () { navigateSplit(book, ch.id, h.id, true); });
        nav.appendChild(sub);
      });
    });
    scroller.scrollTop = state.y || 0;
  }
  function navigateSplit(book, id, section, record, restoreY) {
    var state = paneState(book), scroller = $('split-' + book + '-scroll');
    if (record !== false) pushReadingTrail({ book: book, chapter: state.chapter,
      section: state.section || 'top', y: scroller.scrollTop });
    splitFocused = book;
    if (state.chapter !== id) {
      splitPositions[book] = { chapter: id, section: section || 'top', y: 0 };
      renderSplitPane(book);
    }
    var article = $('split-' + book + '-article');
    var target = section && section !== 'top' ?
      article.querySelector('[id="sec-' + section + '"]') : null;
    var newY = restoreY == null ?
      (target ? target.getBoundingClientRect().top - scroller.getBoundingClientRect().top +
        scroller.scrollTop - 12 : 0) : restoreY;
    scroller.scrollTop = Math.max(0, newY);
    splitPositions[book] = { chapter: id, section: section || 'top', y: scroller.scrollTop };
    STORE.set('split-positions', splitPositions);
    $('split-' + book + '-toc').hidden = true;
    $('split-' + book + '-toc-button').setAttribute('aria-expanded', 'false');
  }
  function openSplit() {
    if (!splitAvailable()) return;
    if (current && !els.reader.hidden) {
      splitFocused = current.ch.book;
      splitPositions[splitFocused] = { chapter: current.ch.id, y: readerScrollY(), section: activeSection };
      savePosition();
    }
    splitMode = true;
    document.body.classList.add('split-active');
    $('split-reader').hidden = false;
    ['rules', 'lore'].forEach(renderSplitPane);
    updateReadingControls();
    STORE.set('split-positions', splitPositions);
  }
  function closeSplit() {
    if (!splitMode) return;
    saveSplitPositions();
    splitMode = false;
    document.body.classList.remove('split-active');
    $('split-reader').hidden = true;
    var frame = paneState(splitFocused);
    suppressTrail = true;
    resumeY = frame.y;
    resumeBlock = null;
    current = null;
    useBook(splitFocused);
    var hash = hrefTo(frame.chapter);
    if (location.hash === hash) route(); else location.hash = hash;
    updateReadingControls();
  }
  function toggleSplit() {
    if (splitMode) closeSplit();
    else openSplit();
  }
  $('btn-reading-back').addEventListener('click', readingBack);
  $('lore-switch').addEventListener('click', changeLoreMode);
  $('btn-split').addEventListener('click', toggleSplit);
  ['rules', 'lore'].forEach(function (book) {
    var button = $('split-' + book + '-toc-button');
    var toc = $('split-' + book + '-toc');
    button.addEventListener('click', function () {
      var opened = toc.hidden;
      toc.hidden = !opened;
      button.setAttribute('aria-expanded', opened ? 'true' : 'false');
      splitFocused = book;
    });
    $('split-' + book + '-scroll').addEventListener('pointerdown', function () { splitFocused = book; });
    $('split-' + book + '-scroll').addEventListener('wheel', function () { splitFocused = book; }, { passive: true });
    $('split-' + book + '-scroll').addEventListener('touchstart', function () { splitFocused = book; }, { passive: true });
    $('split-' + book + '-scroll').addEventListener('focus', function () { splitFocused = book; });
    $('split-' + book + '-scroll').addEventListener('scroll', function () {
      clearTimeout(splitScrollSaveTimer);
      splitScrollSaveTimer = setTimeout(saveSplitPositions, 300);
    }, { passive: true });
  });
  /* ---------- Прогресс и активный раздел ---------- */
  function docProgress() {
    if (hasReaderScroller()) {
      var scrollable = Math.max(1, els.main.scrollHeight - els.main.clientHeight);
      return Math.min(1, Math.max(0, els.main.scrollTop / scrollable));
    }
    var h = document.documentElement;
    var max = Math.max(1, h.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.pageYOffset / max));
  }
  function updateProgress() {
    if (!current) return;
    var p = (current.index + docProgress()) / chapters.length;
    var pct = Math.round(p * 100);
    els['progress-bar'].style.transform = 'scaleX(' + p.toFixed(4) + ')';
    els.progress.setAttribute('aria-valuenow', String(pct));
    els.progress.setAttribute('aria-valuetext', 'Прочитано ' + pct + '% книги');
  }
  function updateActive() {
    if (!current) return;
    var hs = els.article.querySelectorAll('h2[id], h3[id]');
    var limit = els.topbar.offsetHeight + 40, found = 'top';
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].getBoundingClientRect().top <= limit) found = hs[i].id.replace(/^sec-/, ''); else break;
    }
    if (found !== activeSection) { activeSection = found; markTocActive(); updateBookmarkBtn(); scrollTocIntoView(); }
  }
  function scrollTocIntoView() {
    var el = els.toc.querySelector('.is-current:not([data-sec="top"])') || els.toc.querySelector('.is-current');
    if (!el || els.sidebar.offsetParent === null) return;
    var box = els.sidebar.querySelector('.sidebar__panels'), r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top + 40 || r.bottom > b.bottom - 40) box.scrollTop += (r.top - b.top) - b.height / 3;
  }
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (els.reader.hidden) return;
      updateProgress(); updateActive();
      clearTimeout(scrollTimer); scrollTimer = setTimeout(savePosition, 400);
    });
  }
  function savePosition() {
    if (!current || els.reader.hidden) return;
    STORE.set('position', { chapter: current.ch.id, section: activeSection, y: Math.round(readerScrollY()), block: firstVisibleBlock() });
  }
  function saveScroll() { savePosition(); }

  /* ---------- Подсветка результатов поиска ---------- */
  function clearHighlight() {
    var marks = els.article.querySelectorAll('mark.hl');
    Array.prototype.forEach.call(marks, function (m) { var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
    els['hl-bar'].hidden = true;
  }
  function applyHighlight() {
    var hl = pendingHL; pendingHL = null;
    if (!hl || !hl.tokens.length) return;
    var walker = document.createTreeWalker(els.article, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    var count = 0, first = null;
    nodes.forEach(function (node) {
      var text = node.nodeValue, rs = SEARCH.ranges(SEARCH.norm(text), hl.tokens);
      if (!rs.length) return;
      var frag = document.createDocumentFragment(), pos = 0;
      rs.forEach(function (r) {
        if (r[0] > pos) frag.appendChild(document.createTextNode(text.slice(pos, r[0])));
        var m = document.createElement('mark'); m.className = 'hl'; m.textContent = text.slice(r[0], r[1]); frag.appendChild(m);
        if (!first) first = m; count++; pos = r[1];
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });
    if (count) {
      els['hl-text'].textContent = 'Совпадений на странице: ' + count + ' · «' + hl.display + '»';
      els['hl-bar'].hidden = false;
    }
    var target = hl.block != null ? els.article.querySelector('[data-b="' + hl.block + '"]') : null;
    var scrollEl = target ? (target.querySelector('mark.hl') || target) : first;
    if (scrollEl) setTimeout(function () { scrollToEl(scrollEl, false); }, 0);
  }
  els['hl-clear'].addEventListener('click', clearHighlight);

  /* ---------- Поиск ---------- */
  function ensureIndex() { if (!searchIndex) searchIndex = SEARCH.build(chapters); return searchIndex; }
  function runSearch() {
    var q = els['search-input'].value;
    lastQuery = q;
    var res = SEARCH.search(ensureIndex(), q, 100);
    var box = els['search-results']; box.textContent = '';
    if (res.status === 'empty') { els['search-status'].textContent = q.length ? 'Введите хотя бы одну букву или цифру.' : 'Введите слово или фразу.'; return; }
    if (res.status === 'none') { els['search-status'].textContent = 'По запросу «' + q.trim() + '» ничего не найдено. Попробуйте часть слова или другую форму.'; return; }
    els['search-status'].textContent = 'Найдено: ' + res.total + (res.total > res.results.length ? ' (показаны первые ' + res.results.length + ')' : '');
    var ul = document.createElement('ul'); ul.className = 'results';
    var lastCh = -1;
    res.results.forEach(function (e) {
      var ch = chapters[e.c];
      var li = document.createElement('li');
      var a = document.createElement('a'); a.className = 'results__item';
      a.href = hrefTo(ch.id, e.section);
      var meta = document.createElement('span'); meta.className = 'results__meta';
      meta.textContent = ch.title + (e.sectionText && e.sectionText !== ch.title ? ' › ' + e.sectionText : '');
      var sn = document.createElement('span'); sn.className = 'results__snip'; sn.innerHTML = SEARCH.snippet(e.text, res.toks);
      a.appendChild(meta); a.appendChild(sn);
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        pendingHL = { tokens: res.toks, block: e.b, display: q.trim() };
        var sameHash = location.hash === a.getAttribute('href');
        if (current && current.ch.id === ch.id && !els.reader.hidden) { clearHighlight(); applyHighlight(); updateActive(); }
        else if (sameHash) route();
        else location.hash = a.getAttribute('href').slice(1);
        if (isMobile()) closeDrawer();
      });
      li.appendChild(a); ul.appendChild(li);
    });
    box.appendChild(ul);
  }
  var searchTimer;
  els['search-input'].addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 120); });
  els['search-form'].addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });

  /* ---------- Вкладки меню ---------- */
  var TABS = ['toc', 'search', 'bookmarks'];
  function selectTab(name, focus) {
    TABS.forEach(function (t) {
      var on = t === name, tab = $('tab-' + t), panel = $('panel-' + t);
      tab.setAttribute('aria-selected', on ? 'true' : 'false'); tab.tabIndex = on ? 0 : -1; panel.hidden = !on;
    });
    if (name === 'bookmarks') renderBookmarks();
    if (name === 'search' && focus) { els['search-input'].focus(); els['search-input'].select(); }
    if (name === 'toc') { markTocActive(); setTimeout(scrollTocIntoView, 0); }
  }
  TABS.forEach(function (t, i) {
    var tab = $('tab-' + t);
    tab.addEventListener('click', function () { selectTab(t, true); });
    tab.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return; e.preventDefault();
      var n = TABS[(i + d + TABS.length) % TABS.length]; selectTab(n, false); $('tab-' + n).focus();
    });
  });

  /* ---------- Меню (выдвижная панель на телефоне) ---------- */
  function openDrawer(tab) {
    if (isMobile()) { document.body.classList.add('drawer-open'); els.backdrop.hidden = false; }
    else { document.body.classList.remove('sidebar-hidden'); settings.sidebar = true; saveSettings(); }
    els['btn-menu'].setAttribute('aria-expanded', 'true');
    selectTab(tab || selectedTab(), true);
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open'); els.backdrop.hidden = true;
    els['btn-menu'].setAttribute('aria-expanded', isMobile() ? 'false' : (document.body.classList.contains('sidebar-hidden') ? 'false' : 'true'));
  }
  function selectedTab() { for (var i = 0; i < TABS.length; i++) if ($('tab-' + TABS[i]).getAttribute('aria-selected') === 'true') return TABS[i]; return 'toc'; }
  function toggleMenu() {
    if (isMobile()) { if (document.body.classList.contains('drawer-open')) { closeDrawer(); els['btn-menu'].focus(); } else openDrawer(); }
    else {
      var hide = !document.body.classList.contains('sidebar-hidden');
      document.body.classList.toggle('sidebar-hidden', hide);
      settings.sidebar = !hide; saveSettings();
      els['btn-menu'].setAttribute('aria-expanded', hide ? 'false' : 'true');
    }
  }
  els['btn-menu'].addEventListener('click', toggleMenu);
  els.backdrop.addEventListener('click', function () { closeDrawer(); els['btn-menu'].focus(); });
  els['btn-search'].addEventListener('click', function () { openDrawer('search'); });
  els['to-toc'].addEventListener('click', function () { openDrawer('toc'); });
  els['btn-prev'].addEventListener('click', function () { go(chapters[current.index - 1]); });
  els['btn-next'].addEventListener('click', function () { go(chapters[current.index + 1]); });

  /* ---------- Закладки ---------- */
  function getBookmarks() { var b = STORE.get('bookmarks', []); return Array.isArray(b) ? b : []; }
  function bmKey(chId, sec) { return chId + '#' + (sec || 'top'); }
  function sectionTitle(ch, sec) {
    if (!sec || sec === 'top') return ch.title;
    for (var i = 0; i < ch.headings.length; i++) if (ch.headings[i].id === sec) return ch.headings[i].text;
    return ch.title;
  }
  function updateBookmarkBtn() {
    if (!current) return;
    var on = getBookmarks().some(function (b) { return bmKey(b.chapter, b.section) === bmKey(current.ch.id, activeSection); });
    els['btn-bookmark'].setAttribute('aria-pressed', on ? 'true' : 'false');
    els['btn-bookmark'].setAttribute('aria-label', on ? 'Убрать закладку' : 'Добавить закладку на этот раздел');
    els['btn-bookmark'].classList.toggle('is-on', on);
  }
  function toggleBookmark() {
    if (!current) return;
    var list = getBookmarks(), key = bmKey(current.ch.id, activeSection);
    var idx = -1; list.forEach(function (b, i) { if (bmKey(b.chapter, b.section) === key) idx = i; });
    if (idx >= 0) { list.splice(idx, 1); announce('Закладка удалена'); }
    else { list.push({ chapter: current.ch.id, section: activeSection, title: sectionTitle(current.ch, activeSection), chTitle: current.ch.title, ts: Date.now() }); announce('Закладка добавлена'); }
    STORE.set('bookmarks', list); updateBookmarkBtn();
    if (selectedTab() === 'bookmarks') renderBookmarks();
  }
  function renderBookmarks() {
    var ul = els.bookmarks; ul.textContent = '';
    // Скрытые главы Мастера и закладки другого раздела не учитываются:
    // иначе игрок увидит сообщение о несуществующих для него закладках.
    var list = getBookmarks().filter(function (b) {
      var ch = chapterById(b.chapter);
      return ch && ch.book === bookId &&
        (!b.section || b.section === 'top' || ch.headings.some(function (h) { return h.id === b.section; }));
    });
    els['bookmarks-hint'].textContent = list.length ? '' : 'Закладок пока нет. Нажмите значок закладки наверху, чтобы запомнить текущий раздел.';
    list.forEach(function (b) {
      var ch = chapterById(b.chapter);
      var li = document.createElement('li'); li.className = 'bookmarks__item';
      var a = document.createElement('a'); a.className = 'bookmarks__link'; a.href = hrefTo(b.chapter, b.section);
      var t = document.createElement('span'); t.className = 'bookmarks__title'; t.textContent = sectionTitle(ch, b.section);
      var m = document.createElement('span'); m.className = 'bookmarks__meta'; m.textContent = ch.title;
      a.appendChild(t); if (sectionTitle(ch, b.section) !== ch.title) a.appendChild(m);
      a.addEventListener('click', function () { if (isMobile()) closeDrawer(); });
      var d = document.createElement('button'); d.type = 'button'; d.className = 'icon-btn icon-btn--small'; d.setAttribute('aria-label', 'Удалить закладку: ' + t.textContent);
      d.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      d.addEventListener('click', function () {
        var l2 = getBookmarks().filter(function (x) { return bmKey(x.chapter, x.section) !== bmKey(b.chapter, b.section); });
        STORE.set('bookmarks', l2); renderBookmarks(); updateBookmarkBtn(); announce('Закладка удалена');
      });
      li.appendChild(a); li.appendChild(d); ul.appendChild(li);
    });
  }
  els['btn-bookmark'].addEventListener('click', toggleBookmark);

  /* ---------- Настройки ---------- */
  function saveSettings() { STORE.set('settings', settings); }
  function syncSettingsUI() {
    var s = settings;
    Array.prototype.forEach.call(document.querySelectorAll('#set-theme .seg__btn'), function (b) { b.setAttribute('aria-pressed', b.dataset.theme === s.theme ? 'true' : 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('#set-lh .seg__btn'), function (b) { b.setAttribute('aria-pressed', Number(b.dataset.lh) === s.lineHeight ? 'true' : 'false'); });
    if ($('set-font-head').value !== s.fontHeading) $('set-font-head').value = s.fontHeading;
    if ($('set-font-body').value !== s.fontBody) $('set-font-body').value = s.fontBody;
    $('set-volume').value = s.ambVolume; els['out-volume'].textContent = s.ambVolume + '%';
    $('set-font').value = s.fontScale; $('out-font').textContent = s.fontScale + '%';
    $('set-measure').value = s.measure; $('out-measure').textContent = s.measure + ' px';
    $('set-gm').checked = gmMode;
    els['settings-note'].hidden = STORE.isPersistent();
  }
  function change(patch) {
    settings = THEME.sanitize(Object.assign({}, settings, patch));
    THEME.apply(settings); saveSettings(); syncSettingsUI();
    // размер, интервал и шрифт меняют разбивку на страницы — пересчитываем, сохраняя место чтения
  }
  $('set-gm').addEventListener('change', function (e) {
    gmMode = e.target.checked;
    STORE.set('gm-mode', gmMode);
    var oldId = current && current.ch.id;
    prepare();
    if (splitMode) {
      ['rules', 'lore'].forEach(renderSplitPane);
      updateReadingControls();
      syncSettingsUI();
      return;
    }
    useBook(bookId);
    if (oldId && chapterById(oldId)) {
      current = null;
      route();
    } else if (oldId) {
      current = null;
      location.hash = '#/';
      route();
    } else {
      fillHome();
    }
    syncSettingsUI();
  });
  function openSettings() { syncSettingsUI(); if (els.settings.showModal) els.settings.showModal(); else els.settings.setAttribute('open', ''); }
  Array.prototype.forEach.call(document.querySelectorAll('#set-theme .seg__btn'), function (b) { b.addEventListener('click', function () { change({ theme: b.dataset.theme }); }); });
  Array.prototype.forEach.call(document.querySelectorAll('#set-lh .seg__btn'), function (b) { b.addEventListener('click', function () { change({ lineHeight: Number(b.dataset.lh) }); }); });
  if (FONTS) {
    FONTS.fill($('set-font-head'), settings.fontHeading); FONTS.fill($('set-font-body'), settings.fontBody);
    $('set-font-head').addEventListener('change', function (e) { change({ fontHeading: e.target.value }); });
    $('set-font-body').addEventListener('change', function (e) { change({ fontBody: e.target.value }); });
  }
  /* Фоновая музыка */
  function renderAmbience(st) {
    var playing = st.playing, want = settings.ambOn;
    var b = els['btn-ambience'];
    b.classList.toggle('is-on', playing);
    b.setAttribute('aria-pressed', want && !st.missing ? 'true' : 'false');
    b.setAttribute('aria-label', want && !st.blocked ? 'Выключить фоновую музыку' : 'Включить фоновую музыку');
    b.title = st.missing ? 'Файл музыки не найден: ' + st.src : (want && !st.blocked ? 'Выключить фоновую музыку' : 'Включить фоновую музыку');
    b.classList.toggle('is-muted', !(want && !st.blocked) || st.missing);
    var msg;
    if (!st.src) msg = 'Музыка включится, когда вы откроете раздел.';
    else if (st.missing) msg = 'Файл музыки не найден: ' + st.src + '. Читать можно и без неё.';
    else if (st.blocked) msg = 'Браузер не разрешил автозапуск. Нажмите «Включить».';
    else if (!want) msg = 'Музыка выключена.';
    else msg = 'Играет музыка раздела «' + (books[bookId] ? books[bookId].title : '') + '».';
    els['amb-status'].textContent = msg;
    els['amb-toggle'].textContent = (want && !st.blocked) ? 'Выключить' : 'Включить';
    els['amb-toggle'].disabled = !!st.missing;
  }
  function toggleAmbience() {
    var st = AMB.state();
    if (st.blocked && settings.ambOn) { AMB.setOn(true); return; }
    change({ ambOn: !settings.ambOn }); AMB.setOn(settings.ambOn);
  }
  if (AMB) {
    AMB.onChange(renderAmbience);
    els['btn-ambience'].addEventListener('click', toggleAmbience);
    els['amb-toggle'].addEventListener('click', toggleAmbience);
    $('set-volume').addEventListener('input', function (e) { change({ ambVolume: Number(e.target.value) }); AMB.setVolume(settings.ambVolume / 100); });
  } else els['btn-ambience'].hidden = true;
  $('set-font').addEventListener('input', function (e) { change({ fontScale: Number(e.target.value) }); });
  $('set-measure').addEventListener('input', function (e) { change({ measure: Number(e.target.value) }); });
  $('font-minus').addEventListener('click', function () { change({ fontScale: settings.fontScale - 10 }); });
  $('font-plus').addEventListener('click', function () { change({ fontScale: settings.fontScale + 10 }); });
  els['settings-reset'].addEventListener('click', function () { change({ theme: 'dark', fontScale: 100, measure: 720, lineHeight: 1.7, fontBody: 'default', fontHeading: 'brighton' }); });
  els['btn-settings'].addEventListener('click', openSettings);
  els['home-settings'].addEventListener('click', openSettings);
  els.settings.addEventListener('click', function (e) { if (e.target === els.settings) els.settings.close(); });

  /* ---------- Главный экран: кнопки ---------- */
  els['btn-continue'].addEventListener('click', function () { var p = STORE.get('position', null); resumeY = p && p.y ? p.y : null; resumeBlock = p && p.block ? p.block : null; });
  function enterReader(tab) {
    var pos = STORE.get('position', null), ch = (pos && chapterById(pos.chapter)) || chapters[0];
    var after = function () { openDrawer(tab); };
    if (els.reader.hidden) {
      pendingTab = tab;
      location.hash = hrefTo(ch.id).slice(1);
    } else after();
  }
  var pendingTab = null;
  els['home-toc'].addEventListener('click', function () { enterReader('toc'); });
  els['home-search'].addEventListener('click', function () { enterReader('search'); });

  /* ---------- Клавиатура ---------- */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable);
    if (e.key === 'Escape') {
      if (document.body.classList.contains('drawer-open')) { closeDrawer(); els['btn-menu'].focus(); }
      return;
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || els.settings.open) return;
    if (e.key === '/' && !els.reader.hidden) { e.preventDefault(); openDrawer('search'); }
    else if (e.key === 'ArrowLeft' && current && !els.reader.hidden && e.shiftKey) { go(chapters[current.index - 1]); }
    else if (e.key === 'ArrowRight' && current && !els.reader.hidden && e.shiftKey) { go(chapters[current.index + 1]); }
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  els.main.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    if (splitMode && !splitAvailable()) closeSplit();
    if (!isMobile()) { document.body.classList.remove('drawer-open'); els.backdrop.hidden = true; }
    els['btn-menu'].setAttribute('aria-expanded', isMobile() ? (document.body.classList.contains('drawer-open') ? 'true' : 'false') : (document.body.classList.contains('sidebar-hidden') ? 'false' : 'true'));
    updateProgress();
  });
  window.addEventListener('pagehide', savePosition);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') savePosition(); });
  window.addEventListener('hashchange', function () { route(); if (pendingTab && !els.reader.hidden) { var t = pendingTab; pendingTab = null; openDrawer(t); } });

  /* ---------- Запуск ---------- */
  function init() {
    if (!prepare()) {
      els.home.hidden = false;
      document.getElementById('home-title').textContent = 'Книга не найдена';
      document.getElementById('home-tagline').textContent = 'Файл js/book-data.js не загружен. Запустите «node tools/build.js» (см. README.md).';
      return;
    }
    useBook('rules');
    if (AMB) { AMB.setVolume(settings.ambVolume / 100); AMB.setOn(settings.ambOn); renderAmbience(AMB.state()); }
    if (!settings.sidebar) document.body.classList.add('sidebar-hidden');
    els['btn-menu'].setAttribute('aria-expanded', isMobile() ? 'false' : (settings.sidebar ? 'true' : 'false'));
    syncSettingsUI();
    var r = parseHash();
    if (r.view === 'home') {
      // первое открытие страницы без хэша — главный экран
      if (!location.hash) { showHome(); return; }
    }
    route();
    if (!isMobile() && !els.reader.hidden) selectTab('toc', false);
  }
  init();

  // для автотестов
  window.__gf = { chapters: function () { return chapters; }, go: go };
})();
