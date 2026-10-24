/*
 * Режим «книга»: текст главы режется на страницы, которые листаются кнопками,
 * стрелками клавиатуры, нажатием у края страницы и свайпом. Есть анимация перелистывания
 * вперёд и назад (на широком экране — разворот из двух страниц, на узком — одна страница).
 *
 * Как это устроено (простыми словами):
 *   1. Невидимая копия главы выстраивается в колонки высотой со страницу — так мы узнаём,
 *      сколько получится страниц и на какой странице стоит каждый абзац и заголовок.
 *   2. Каждая видимая страница — это окошко, в котором показана «своя» колонка той же главы.
 *   3. При листании над разворотом поворачивается «листок» (CSS 3D), под ним уже лежит новая страница.
 *
 * Скрипт ничего не знает про оглавление и настройки: ими занимается app.js,
 * а сюда передаются функции через GFPager.init({...}).
 */
(function (root) {
  'use strict';

  var P = {};
  var cfg = null;
  var el = {};                 // book, stage, spread, measure, prev, next, status, zonePrev, zoneNext
  var enabled = false;
  var geo = null;              // геометрия: размеры страницы и режим «разворот / одна страница»
  var metrics = {};            // номер главы -> { pages, list[{id,page}], pageOf{}, heads[{id,page}], el }
  var st = { ch: 0, s: 0 };    // текущая глава и номер разворота (в режиме одной страницы = номер страницы)
  var busy = false, queued = 0;
  var flipToken = 0;           // номер текущего листания: устаревшее листание не должно затирать переход по оглавлению
  var timers = {};

  var SPREAD_MIN = 860;        // минимальная ширина области для разворота из двух страниц
  var PAGE_MAX_W = 640;

  /* ---------- Вспомогательное ---------- */
  function reduced() { return !!(cfg && cfg.reduceMotion && cfg.reduceMotion()); }
  function flipMode() { return (cfg && cfg.flipMode && cfg.flipMode()) || 'book'; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // Готовит HTML главы для копии: убирает id (чтобы не дублировались), включает загрузку картинок
  function prep(html, forMeasure) {
    html = String(html || '')
      .replace(/\sloading="lazy"/g, ' loading="eager"')
      .replace(/\stabindex="-1"/g, '');
    return forMeasure ? html.replace(/\sid="/g, ' data-id="') : html.replace(/\sid="[^"]*"/g, '');
  }

  function wireImages(box, onLoad) {
    var imgs = box.querySelectorAll('img');
    Array.prototype.forEach.call(imgs, function (img) {
      function fail() {
        img.hidden = true;
        var f = img.closest('.figure'), miss = f && f.querySelector('.figure__missing');
        if (miss) { miss.hidden = false; f.classList.add('is-missing'); }
        if (onLoad) onLoad();
      }
      img.addEventListener('error', fail);
      if (onLoad) img.addEventListener('load', onLoad);
    });
  }

  /* ---------- Геометрия ---------- */
  function computeGeo() {
    var w = el.stage.clientWidth, h = el.stage.clientHeight;
    var aw = Math.max(200, w - 24), ah = Math.max(240, h - 24);
    var spread = aw >= SPREAD_MIN;
    var pw = Math.floor(Math.min(spread ? aw / 2 : aw, PAGE_MAX_W));
    var ph = Math.floor(Math.min(ah, pw * 1.8));
    var px = clamp(Math.round(pw * 0.075), 16, 46), pt = 26, pb = 46;
    var g = { spread: spread, pw: pw, ph: ph, px: px, pt: pt, pb: pb, cw: pw - 2 * px, ch: ph - pt - pb };
    var b = el.book.style;
    b.setProperty('--pg-w', pw + 'px'); b.setProperty('--pg-h', ph + 'px');
    b.setProperty('--pg-cw', g.cw + 'px'); b.setProperty('--pg-ch', g.ch + 'px');
    b.setProperty('--pg-px', px + 'px'); b.setProperty('--pg-pt', pt + 'px'); b.setProperty('--pg-pb', pb + 'px');
    el.book.classList.toggle('is-narrow', pw < 560);
    el.book.classList.toggle('is-spread', spread);
    return g;
  }

  /* ---------- Измерение глав ---------- */
  function compute(box) {
    var W = geo.cw;
    var pages = Math.max(1, Math.ceil((box.scrollWidth - 0.5) / W));
    var base = box.getBoundingClientRect().left;
    var list = [], pageOf = {}, heads = [];
    Array.prototype.forEach.call(box.querySelectorAll('[data-b]'), function (e) {
      var r = e.getClientRects()[0]; if (!r) return;
      var p = clamp(Math.floor((r.left - base + 1) / W), 0, pages - 1);
      var id = e.getAttribute('data-b');
      list.push({ id: id, page: p }); pageOf[id] = p;
      if (/^H[1-4]$/.test(e.tagName)) {
        var sid = e.getAttribute('data-id');
        if (sid) heads.push({ id: sid.replace(/^sec-/, ''), page: p, level: Number(e.tagName.charAt(1)), bid: id });
      }
    });
    return { pages: pages, list: list, pageOf: pageOf, heads: heads };
  }

  /* Повтор шапки таблицы. Браузеры сами не повторяют шапку в колонках, поэтому перед первой строкой,
     которая оказалась на новой странице, вставляется копия шапки. Вставка сдвигает строки вниз,
     поэтому разбивка пересчитывается, пока не станет устойчивой. */
  function applyRepeats(box, ids) {
    Array.prototype.forEach.call(box.querySelectorAll('tr.thead-repeat'), function (e) { e.parentNode.removeChild(e); });
    ids.forEach(function (id) {
      var row = box.querySelector('tr[data-b="' + id + '"]');
      var table = row && row.closest('table'), hr = table && table.tHead && table.tHead.rows[0];
      if (!hr) return;
      var c = hr.cloneNode(true);
      c.removeAttribute('data-b'); c.className = 'thead-repeat'; c.setAttribute('aria-hidden', 'true');
      Array.prototype.forEach.call(c.querySelectorAll('[data-b]'), function (e) { e.removeAttribute('data-b'); });
      row.parentNode.insertBefore(c, row);
    });
  }
  function sameList(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
  function analyze(box) {
    var tables = Array.prototype.filter.call(box.querySelectorAll('table'), function (t) {
      return t.tHead && t.tHead.rows[0] && t.tBodies.length && root.getComputedStyle(t).display === 'table';
    });
    var ids = [], m = compute(box);
    for (var pass = 0; tables.length && pass < 6; pass++) {
      var need = [];
      tables.forEach(function (t) {
        var last = m.pageOf[t.tHead.rows[0].getAttribute('data-b')];
        if (last == null) return;
        Array.prototype.forEach.call(t.tBodies[0].rows, function (r) {
          if (r.classList.contains('thead-repeat')) return;
          var p = m.pageOf[r.getAttribute('data-b')];
          if (p == null) return;
          if (p > last) need.push(r.getAttribute('data-b'));
          last = p;
        });
      });
      if (sameList(need, ids)) break;
      ids = need; applyRepeats(box, ids); m = compute(box);
    }
    m.repeats = ids;
    return m;
  }

  function measure(i) {
    var m = metrics[i];
    if (m) return m;
    var box = document.createElement('div');
    box.className = 'pg__flow prose';
    box.innerHTML = prep(cfg.getHtml(i, true), true);
    el.measure.appendChild(box);
    m = analyze(box); m.el = box; metrics[i] = m;
    wireImages(box, function () { schedule(i); });
    return m;
  }

  // Картинка загрузилась или не нашлась — страницы могли сдвинуться, пересчитываем
  function schedule(i) {
    clearTimeout(timers[i]);
    timers[i] = setTimeout(function () {
      var m = metrics[i]; if (!m || !enabled) return;
      var anchor = (i === st.ch) ? P.anchor() : null;
      var before = m.pages;
      var fresh = analyze(m.el);
      m.repeats = fresh.repeats;
      m.pages = fresh.pages; m.list = fresh.list; m.pageOf = fresh.pageOf; m.heads = fresh.heads;
      if (i === st.ch && !busy) {
        if (anchor != null) st.s = spreadOfPage(pageOf(m, anchor));
        st.s = clamp(st.s, 0, lastSpread(m.pages));
        if (m.pages !== before || true) { render(); notify(); }
      }
    }, 120);
  }

  /* ---------- Страницы и развороты ---------- */
  function leftIdx(s) { return geo.spread ? 2 * s - 1 : -1; }
  function rightIdx(s) { return geo.spread ? 2 * s : s; }
  function lastSpread(n) { return geo.spread ? Math.floor(n / 2) : n - 1; }
  function spreadOfPage(p) { return geo.spread ? Math.floor((p + 1) / 2) : p; }
  function pageOf(m, id) { var p = m.pageOf[id]; return p == null ? 0 : p; }
  function visible(s, n) {
    var out = [], l = leftIdx(s), r = rightIdx(s);
    if (l >= 0 && l < n) out.push(l);
    if (r >= 0 && r < n) out.push(r);
    return out;
  }

  function blankPage(side) {
    var d = document.createElement('div');
    d.className = 'pg pg--blank pg--' + side;
    var o = document.createElement('span'); o.className = 'pg__orn'; o.setAttribute('aria-hidden', 'true');
    d.appendChild(o);
    return d;
  }

  // Одна страница главы ch с номером p (если такой нет — чистая страница)
  function makePage(ch, p, side) {
    var m = measure(ch);
    if (p < 0 || p >= m.pages) return blankPage(side);
    var d = document.createElement('div');
    d.className = 'pg pg--' + side;
    var clip = document.createElement('div'); clip.className = 'pg__clip';
    var flow = document.createElement('div'); flow.className = 'pg__flow prose';
    flow.innerHTML = prep(cfg.getHtml(ch, false), false);
    applyRepeats(flow, m.repeats || []);
    flow.style.transform = 'translateX(-' + (p * geo.cw) + 'px)';
    wireImages(flow, null);
    clip.appendChild(flow); d.appendChild(clip);
    var n = document.createElement('div'); n.className = 'pg__num'; n.textContent = String(p + 1);
    d.appendChild(n);
    return d;
  }
  function faceOf(ch, s, side) { return makePage(ch, side === 'l' ? leftIdx(s) : rightIdx(s), side === 'l' ? 'l' : 'r'); }

  function render() {
    var m = measure(st.ch);
    st.s = clamp(st.s, 0, lastSpread(m.pages));
    el.spread.textContent = '';
    el.spread.className = 'book__spread' + (geo.spread ? ' is-spread' : '');
    if (geo.spread) {
      el.spread.appendChild(faceOf(st.ch, st.s, 'l'));
      el.spread.appendChild(faceOf(st.ch, st.s, 'r'));
      var sp = document.createElement('span'); sp.className = 'book__spine'; sp.setAttribute('aria-hidden', 'true');
      el.spread.appendChild(sp);
    } else {
      el.spread.appendChild(faceOf(st.ch, st.s, 'r'));
    }
    updateUI();
  }

  function neighbor(dir) {
    var m = measure(st.ch), ls = lastSpread(m.pages);
    if (dir > 0) {
      if (st.s < ls) return { ch: st.ch, s: st.s + 1 };
      if (st.ch < cfg.count - 1) return { ch: st.ch + 1, s: 0 };
      return null;
    }
    if (st.s > 0) return { ch: st.ch, s: st.s - 1 };
    if (st.ch > 0) return { ch: st.ch - 1, s: lastSpread(measure(st.ch - 1).pages) };
    return null;
  }

  function updateUI() {
    var m = measure(st.ch), v = visible(st.s, m.pages);
    var a = v[0] + 1, b = v[v.length - 1] + 1;
    var label = (a === b ? 'Страница ' + a : 'Страницы ' + a + '–' + b) + ' из ' + m.pages;
    el.status.textContent = label;
    var hasPrev = !!neighbor(-1), hasNext = !!neighbor(1);
    el.prev.disabled = !hasPrev; el.next.disabled = !hasNext;
    el.zonePrev.disabled = !hasPrev; el.zoneNext.disabled = !hasNext;
  }

  /* ---------- Состояние для приложения ---------- */
  // Раздел для оглавления: первый заголовок на видимых страницах, а если их там нет — последний перед ними.
  // Так после перехода по оглавлению подсвечивается именно выбранный раздел.
  function sectionAt(m, firstPage, lastPage) {
    var before = 'top';
    for (var i = 0; i < m.heads.length; i++) {
      var h = m.heads[i];
      if (h.level < 2 || h.level > 3) continue;
      if (h.page >= firstPage && h.page <= lastPage) return h.id;
      if (h.page < firstPage) before = h.id; else break;
    }
    return before;
  }
  function info() {
    var m = measure(st.ch), v = visible(st.s, m.pages);
    var first = v.length ? v[0] : 0, last = v.length ? v[v.length - 1] : 0;
    return { ch: st.ch, first: first, last: last, pages: m.pages, section: sectionAt(m, first, last), anchor: P.anchor(),
      progress: m.pages > 0 ? (last + 1) / m.pages : 0 };
  }
  function notify() { if (cfg && cfg.onChange) cfg.onChange(info()); }

  /* Блок, с которого начинается видимая страница: по нему положение сохраняется
     при смене размера шрифта, окна или режима чтения. */
  P.anchor = function () {
    if (!enabled || !geo) return null;
    var m = measure(st.ch), v = visible(st.s, m.pages);
    var p0 = v.length ? v[0] : 0, list = m.list;
    for (var i = 0; i < list.length; i++) {
      if (list[i].page >= p0) return (list[i].page === p0 || i === 0) ? list[i].id : list[i - 1].id;
    }
    return list.length ? list[list.length - 1].id : null;
  };

  /* Прерывает идущее листание (например, при переходе по оглавлению), чтобы оно не вернуло старую страницу */
  function cancelFlip() {
    flipToken++; busy = false; queued = 0;
    if (el.spread && el.spread.getAnimations) el.spread.getAnimations().forEach(function (a) { a.cancel(); });
  }

  /* ---------- Переходы без анимации ---------- */
  P.show = function (ch, target) {
    cancelFlip();
    st.ch = clamp(ch, 0, cfg.count - 1);
    var m = measure(st.ch), p = 0;
    if (target) {
      if (target.block != null && m.pageOf[target.block] != null) p = m.pageOf[target.block];
      else if (target.section) { for (var i = 0; i < m.heads.length; i++) if (m.heads[i].id === target.section) { p = m.heads[i].page; break; } }
      else if (target.end) p = m.pages - 1;
      else if (typeof target.page === 'number') p = target.page;
    }
    st.s = spreadOfPage(clamp(p, 0, m.pages - 1));
    render(); notify();
  };
  P.showBlock = function (id) {
    cancelFlip();
    var m = measure(st.ch);
    if (m.pageOf[id] == null) return;
    st.s = spreadOfPage(m.pageOf[id]); render(); notify();
  };
  P.refresh = function () { if (enabled && geo) { render(); } };
  P.current = function () { return enabled && geo ? info() : null; };
  P.isEnabled = function () { return enabled; };

  /* ---------- Листание с анимацией ---------- */
  function finish(to) {
    st = { ch: to.ch, s: to.s };
    busy = false;
    render(); notify();
    if (queued) { var d = queued; queued = 0; flip(d); }
  }

  function flip(dir) {
    if (!enabled || !geo) return false;
    if (busy) { queued = dir; return true; }
    var to = neighbor(dir);
    if (!to) return false;
    measure(to.ch);                       // нужна разметка и новой главы
    var mode = flipMode();
    var canAnimate = el.spread.animate && !reduced() && mode !== 'none';
    if (!canAnimate) { st = to; render(); notify(); return true; }
    busy = true;
    if (mode === 'fade') fade(to); else turn(dir, to);
    return true;
  }

  function fade(to) {
    var my = ++flipToken;
    var a = el.spread.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = function () {
      if (my !== flipToken) return;
      a.cancel(); st = { ch: to.ch, s: to.s }; render();
      var b = el.spread.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-in' });
      busy = false; notify();
      b.onfinish = function () { b.cancel(); if (my !== flipToken) return; if (queued) { var d = queued; queued = 0; flip(d); } };
    };
  }

  function makeLeaf(front, back, left, originRight) {
    var leaf = document.createElement('div');
    leaf.className = 'book__leaf';
    leaf.style.left = left + 'px';
    leaf.style.transformOrigin = originRight ? '100% 50%' : '0 50%';
    front.classList.add('leaf__face', 'leaf__front'); back.classList.add('leaf__face', 'leaf__back');
    var s1 = document.createElement('span'); s1.className = 'leaf__shade'; front.appendChild(s1);
    var s2 = document.createElement('span'); s2.className = 'leaf__shade'; back.appendChild(s2);
    leaf.appendChild(front); leaf.appendChild(back);
    return { leaf: leaf, shadeFront: s1, shadeBack: s2 };
  }

  function turn(dir, to) {
    var my = ++flipToken;
    var W = geo.pw, DUR = 760, EASE = 'cubic-bezier(.45,.05,.25,1)';
    var sp = el.spread, leafInfo, rot0, rot1, under;
    if (geo.spread) {
      if (dir > 0) {
        // листок справа: спереди — старая правая страница, сзади — новая левая; под ним уже новая правая
        under = { side: 'r', page: faceOf(to.ch, to.s, 'r') };
        leafInfo = makeLeaf(faceOf(st.ch, st.s, 'r'), faceOf(to.ch, to.s, 'l'), W, false);
        rot0 = 0; rot1 = -180;
      } else {
        under = { side: 'l', page: faceOf(to.ch, to.s, 'l') };
        leafInfo = makeLeaf(faceOf(st.ch, st.s, 'l'), faceOf(to.ch, to.s, 'r'), 0, true);
        rot0 = 0; rot1 = 180;
      }
      // подставляем новую страницу под листок
      var old = sp.querySelector('.pg--' + under.side);
      if (old) sp.replaceChild(under.page, old); else sp.appendChild(under.page);
    } else {
      if (dir > 0) {
        leafInfo = makeLeaf(faceOf(st.ch, st.s, 'r'), blankPage('r'), 0, false);
        under = { side: 'r', page: faceOf(to.ch, to.s, 'r') };
        rot0 = 0; rot1 = -180;
        var o1 = sp.querySelector('.pg'); if (o1) sp.replaceChild(under.page, o1);
      } else {
        leafInfo = makeLeaf(faceOf(to.ch, to.s, 'r'), blankPage('r'), 0, false);
        rot0 = -180; rot1 = 0;
      }
    }
    sp.appendChild(leafInfo.leaf);
    var spine = sp.querySelector('.book__spine'); if (spine) sp.appendChild(spine);

    var anim = leafInfo.leaf.animate(
      [{ transform: 'rotateY(' + rot0 + 'deg)' }, { transform: 'rotateY(' + rot1 + 'deg)' }],
      { duration: DUR, easing: EASE, fill: 'forwards' });
    // затенение: лицевая сторона темнеет по мере поворота, оборотная светлеет при посадке
    var forward = Math.abs(rot1) > Math.abs(rot0) ? true : false;   // поворот «от 0 к 180»
    var a1 = forward ? [{ opacity: 0 }, { opacity: .55, offset: .5 }, { opacity: .55 }] : [{ opacity: .55 }, { opacity: .55, offset: .5 }, { opacity: 0 }];
    var a2 = forward ? [{ opacity: .55 }, { opacity: .55, offset: .5 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: .55, offset: .5 }, { opacity: .55 }];
    leafInfo.shadeFront.animate(a1, { duration: DUR, easing: EASE, fill: 'forwards' });
    leafInfo.shadeBack.animate(a2, { duration: DUR, easing: EASE, fill: 'forwards' });

    var done = false;
    function end() { if (done || my !== flipToken) return; done = true; finish(to); }
    anim.onfinish = end;
    setTimeout(end, DUR + 300);          // страховка, если браузер не прислал событие
  }

  // Листание читателем (кнопки, клавиши, край страницы, свайп): только оно может издавать звук
  function userFlip(dir) { if (flip(dir) && cfg.onTurn) cfg.onTurn(); }
  P.next = function () { flip(1); };
  P.prev = function () { flip(-1); };

  /* ---------- Пересчёт при смене размеров, шрифта, настроек ---------- */
  P.relayout = function () {
    if (!enabled) return;
    cancelFlip();
    var anchor = P.anchor(), ch = st.ch;
    el.measure.textContent = ''; metrics = {};
    geo = computeGeo();
    st.ch = ch;
    var m = measure(ch);
    st.s = (anchor != null && m.pageOf[anchor] != null) ? spreadOfPage(m.pageOf[anchor]) : 0;
    busy = false; queued = 0;
    render(); notify();
  };

  P.enable = function () {
    cancelFlip();
    enabled = true;
    el.book.hidden = false;
    geo = computeGeo();
    metrics = {}; el.measure.textContent = '';
  };
  P.disable = function () {
    cancelFlip();
    enabled = false; busy = false; queued = 0;
    el.book.hidden = true; el.spread.textContent = ''; el.measure.textContent = ''; metrics = {};
  };

  /* ---------- Управление: кнопки, края страницы, клавиши, свайп ---------- */
  function bindControls() {
    el.prev.addEventListener('click', function () { userFlip(-1); });
    el.next.addEventListener('click', function () { userFlip(1); });
    el.zonePrev.addEventListener('click', function () { userFlip(-1); });
    el.zoneNext.addEventListener('click', function () { userFlip(1); });

    var sx = 0, sy = 0, t0 = 0, tracking = false;
    el.stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;      // мышью листают кнопками и краями страницы
      tracking = true; sx = e.clientX; sy = e.clientY; t0 = Date.now();
    });
    el.stage.addEventListener('pointerup', function (e) {
      if (!tracking) return; tracking = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Date.now() - t0 < 900 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) userFlip(1); else userFlip(-1); }
    });
    el.stage.addEventListener('pointercancel', function () { tracking = false; });

    document.addEventListener('keydown', function (e) {
      if (!enabled || !cfg.isActive()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
      var k = e.key;
      if (!e.shiftKey && (k === 'ArrowRight' || k === 'PageDown')) { e.preventDefault(); userFlip(1); }
      else if (!e.shiftKey && (k === 'ArrowLeft' || k === 'PageUp')) { e.preventDefault(); userFlip(-1); }
      else if (k === ' ' && !/^(BUTTON|A)$/.test(tag)) { e.preventDefault(); userFlip(e.shiftKey ? -1 : 1); }
    });

    var timer;
    function later() { clearTimeout(timer); timer = setTimeout(function () { if (enabled && !el.book.hidden) P.relayout(); }, 160); }
    if (root.ResizeObserver) new root.ResizeObserver(later).observe(el.stage);
    else root.addEventListener('resize', later);
    if (document.fonts) {
      if (document.fonts.ready) document.fonts.ready.then(later);
      if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', later);
    }
  }

  /*
   * opts: book, stage, spread, measure, prev, next, status, zonePrev, zoneNext — элементы страницы;
   *       count — число глав; getHtml(i, forMeasure) — HTML главы; onChange(info); isActive();
   *       flipMode() — 'book' | 'fade' | 'none'; reduceMotion() — true, если в системе включено «уменьшить анимацию».
   */
  P.init = function (opts) {
    cfg = opts;
    el = { book: opts.book, stage: opts.stage, spread: opts.spread, measure: opts.measure, prev: opts.prev, next: opts.next,
      status: opts.status, zonePrev: opts.zonePrev, zoneNext: opts.zoneNext };
    bindControls();
  };

  root.GFPager = P;
})(window);
