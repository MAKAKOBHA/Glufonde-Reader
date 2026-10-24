/* Три секунды заставки, затем плавное проявление главного меню. */
(function () {
  'use strict';
  var splash = document.getElementById('gf-intro-splash');
  if (!splash) return;
  window.setTimeout(function () {
    document.documentElement.classList.remove('gf-intro-pending');
    document.documentElement.classList.add('gf-intro-revealing');
    splash.remove();
    window.setTimeout(function () {
      document.documentElement.classList.remove('gf-intro-revealing');
    }, 950);
  }, 3000);
})();
