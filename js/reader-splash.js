/* Убирает заставку через 4 секунды; пропуск кликом/клавиатурой отсутствует. */
(function () {
  'use strict';
  var splash = document.getElementById('gf-intro-splash');
  if (!splash) return;
  window.setTimeout(function () {
    splash.classList.add('is-done');
    splash.remove();
  }, 4000);
})();
