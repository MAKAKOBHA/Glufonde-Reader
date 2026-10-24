/*
 * Фоновая музыка (атмосфера) для разделов. Для каждого раздела свой файл — см. js/config.js, поле books.
 *
 *   GFAmbience.setTrack(путь | null) — выбрать звук раздела (прежний плавно затихает)
 *   GFAmbience.setOn(true|false)     — включить / выключить (пауза)
 *   GFAmbience.setVolume(0..1)       — громкость
 *   GFAmbience.onChange(функция)     — получать состояние: { src, on, playing, missing, blocked, volume }
 *
 * Если файла нет — читалка работает как обычно, а в настройках появляется подсказка с путём к файлу.
 * Браузеры запрещают автозапуск звука без нажатия, поэтому после обновления страницы музыку
 * нужно включить кнопкой (состояние «blocked»).
 */
(function (root) {
  'use strict';
  var tracks = {}, cur = null, on = true, vol = 0.4, listeners = [], blocked = false, wasPlaying = false;

  function state() {
    var t = cur && tracks[cur];
    return { src: cur, on: on, playing: !!(t && t.audio && !t.audio.paused && !t.missing), missing: !!(t && t.missing), blocked: blocked, volume: vol };
  }
  function emit() { var st = state(); listeners.forEach(function (f) { try { f(st); } catch (e) { /* не страшно */ } }); }

  function fade(a, to, ms, done) {
    clearInterval(a.__f);
    var from = a.volume, t0 = Date.now();
    a.__f = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / ms);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(a.__f); if (done) done(); }
    }, 40);
  }

  function get(src) {
    var t = tracks[src];
    if (t) return t;
    t = tracks[src] = { missing: false, audio: null };
    try {
      var a = new root.Audio();
      a.loop = true; a.preload = 'none'; a.volume = 0;
      a.addEventListener('error', function () { t.missing = true; emit(); });
      a.addEventListener('play', emit); a.addEventListener('pause', emit);
      a.src = src;
      t.audio = a;
    } catch (e) { t.missing = true; }
    return t;
  }

  function start(src) {
    var t = get(src);
    if (t.missing || !t.audio) { emit(); return; }
    var a = t.audio; blocked = false;
    try {
      var p = a.play();
      if (p && p.then) {
        p.then(function () { if (cur === src && on) fade(a, vol, 900); else a.pause(); })
         .catch(function (e) {
           if (e && e.name === 'AbortError') return;
           if (e && e.name === 'NotAllowedError') blocked = true; else t.missing = true;
           emit();
         });
      } else fade(a, vol, 900);
    } catch (e) { t.missing = true; }
    emit();
  }
  function stop(src) {
    var t = tracks[src];
    if (!t || !t.audio || t.audio.paused) return;
    fade(t.audio, 0, 600, function () { t.audio.pause(); });
  }

  var A = {
    setTrack: function (src) {
      if (src === cur) return;
      var old = cur; cur = src || null; blocked = false;
      if (old) stop(old);
      if (cur && on) start(cur);
      emit();
    },
    setOn: function (v) {
      on = !!v;
      if (cur) { if (on) start(cur); else stop(cur); }
      emit();
    },
    setVolume: function (v) {
      vol = Math.max(0, Math.min(1, Number(v) || 0));
      var t = cur && tracks[cur];
      if (t && t.audio && !t.audio.paused) { clearInterval(t.audio.__f); t.audio.volume = vol; }
      emit();
    },
    onChange: function (f) { listeners.push(f); },
    state: state
  };

  // Когда вкладка скрыта (например, телефон заблокирован), музыку ставим на паузу
  document.addEventListener('visibilitychange', function () {
    var t = cur && tracks[cur];
    if (document.visibilityState === 'hidden') {
      wasPlaying = !!(t && t.audio && !t.audio.paused);
      if (wasPlaying) t.audio.pause();
    } else if (wasPlaying && on && cur) { wasPlaying = false; start(cur); }
  });

  root.GFAmbience = A;
})(window);
