// Shows the "What's new" popup once per browser. After EVERY update: add a new dated block (e.g. Nov 2, 2026) at the TOP of the list in partials/dialogs.html (#newdlg), move old blocks down, and change NEWS_VERSION so it shows again. Any button with data-news reopens it.
(function () {
  const NEWS_VERSION = '2026-11-02b', KEY = 'karaokeNewsSeen', dlg = document.getElementById('newdlg');
  if (!dlg || !dlg.showModal) return;
  let seen = ''; try { seen = localStorage.getItem(KEY) || ''; } catch (e) {}
  if (seen === NEWS_VERSION) return;
  const done = () => { try { localStorage.setItem(KEY, NEWS_VERSION); } catch (e) {} if (dlg.open) dlg.close(); };
  document.getElementById('nwOk').onclick = done;
  dlg.addEventListener('close', done);
  dlg.showModal();
})();
// Any "What's new" button (header menu, welcome page) opens the list again, even after it was dismissed.
(function () {
  const dlg = document.getElementById('newdlg'); if (!dlg || !dlg.showModal) return;
  const ok = document.getElementById('nwOk'); if (ok && !ok.onclick) ok.onclick = () => dlg.close();
  document.querySelectorAll('[data-news]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); if (!dlg.open) { dlg.showModal(); const l = document.getElementById('nwList'); if (l) l.scrollTop = 0; } }));
})();
// "How it works" buttons (header, welcome page and home page) open the guide.
(function () {
  const dlg = document.getElementById('helpdlg'); if (!dlg || !dlg.showModal) return;
  document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); if (!dlg.open) dlg.showModal(); }));
})();
