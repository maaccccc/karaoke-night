// app-download.js: a floating "Download the app" button (bottom right, stays while you scroll). Windows computers only.
(function () {
  // ===== Where the Windows installer lives. Put your own link here (GitHub Releases, Google Drive, OneDrive...). =====
  // The default is a file inside the website's public/downloads folder, but a 76 MB file is better hosted elsewhere (see the README).
  var INSTALLER_URL = 'https://drive.google.com/file/d/1WIqcLtnSxQ3twlKCY2XEixu8Fy_dHZwg/view?usp=drive_link';

  var ua = navigator.userAgent || '', plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var isWindows = /Windows NT/i.test(ua) || /^Win/i.test(plat);
  var mobile = /Mobi|Android|iPhone|iPad|Windows Phone/i.test(ua);
  var inApp = /Electron/i.test(ua) || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;   // already using the app
  if (!isWindows || mobile || inApp || !INSTALLER_URL) return;
  try { if (localStorage.getItem('knDlHidden') === '1') return; } catch (e) {}

  var wrap = document.createElement('div'); wrap.id = 'appDl';
  var a = document.createElement('a'); a.href = INSTALLER_URL; a.setAttribute('download', ''); a.rel = 'noopener';
  a.innerHTML = '<span aria-hidden="true">⬇</span> Download the app'; a.title = 'Install Karaoke Night for Windows';
  var x = document.createElement('button'); x.type = 'button'; x.className = 'ghost'; x.textContent = '×'; x.setAttribute('aria-label', 'Hide the download button'); x.title = 'Hide';
  x.onclick = function () { wrap.remove(); try { localStorage.setItem('knDlHidden', '1'); } catch (e) {} };
  wrap.append(a, x); document.body.appendChild(wrap);
})();
