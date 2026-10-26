// download-page.js: the "PC Desktop / Android APK" chooser (download.html).
(function () {
  // ===== Put your download links here. =====
  var WINDOWS_URL = 'https://drive.google.com/file/d/1GIYj5po865Zc7Zl2ExMQNZfkAQPcoZtw/view?usp=drive_link';
  var APK_URL = '';   // not made yet. Paste the APK link here when it is ready and the card turns into a real download button.

  var ua = navigator.userAgent || '';
  var inApp = /Electron/i.test(ua) || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;   // already using the app
  if (inApp) { location.replace('./'); return; }   // the app version never shows this page

  function setup(btnId, url, label) {
    var b = document.getElementById(btnId);
    if (url) { b.href = url; return; }
    b.removeAttribute('href'); b.removeAttribute('target'); b.classList.add('soon'); b.setAttribute('aria-disabled', 'true'); b.textContent = label;
  }
  setup('dlPcBtn', WINDOWS_URL, 'Coming soon');
  setup('dlApkBtn', APK_URL, 'Coming soon');

  // Highlight the one that fits this device (only if it is actually available).
  var android = /Android/i.test(ua), windows = /Windows NT/i.test(ua) && !/Windows Phone/i.test(ua);
  var pick = android && APK_URL ? 'dlApk' : (windows && WINDOWS_URL ? 'dlPc' : '');
  if (pick) { var c = document.getElementById(pick); c.classList.add('rec'); c.querySelector('.dl-badge').hidden = false; }
})();
