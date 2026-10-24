/*
 * Звук перелистывания страницы. Файл: Sound/page-turn.mp3 (рядом с index.html).
 * Звук включается только когда читатель сам листает страницу кнопками, стрелками, пробелом,
 * краем страницы или свайпом (это вызывает pager.js). Переходы по оглавлению, поиск, прокрутка
 * и пересчёт страниц звука не издают.
 * Если файла нет или браузер не даёт играть звук — читалка работает как обычно, без ошибок.
 *
 *   GFSound.play()          — проиграть звук один раз
 *   GFSound.setEnabled(bool)— включить / выключить
 */
(function (root) {
  'use strict';
  var SRC = 'Sound/page-turn.mp3';   // путь относительно index.html
  var VOLUME = 0.6;
  var enabled = true, audio = null, broken = false;

  function ensure() {
    if (audio || broken) return;
    try {
      audio = new root.Audio();
      audio.preload = 'auto';
      audio.volume = VOLUME;
      audio.addEventListener('error', function () { broken = true; audio = null; });   // файла нет — молча отключаемся
      audio.src = SRC;
    } catch (e) { broken = true; audio = null; }
  }

  function play() {
    if (!enabled || broken) return;
    try {
      ensure();
      if (!audio) return;
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* автозапуск запрещён или файл не загрузился — не страшно */ });
    } catch (e) { /* звук необязателен */ }
  }

  root.GFSound = { play: play, setEnabled: function (v) { enabled = !!v; if (enabled) ensure(); } };
})(window);
