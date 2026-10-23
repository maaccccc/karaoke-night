// Shows the "What's new" popup once per browser. Change NEWS_VERSION to show it again after your next update.
(function () {
  const NEWS_VERSION = '2026-10-23', KEY = 'karaokeNewsSeen', dlg = document.getElementById('newdlg');
  if (!dlg || !dlg.showModal) return;
  let seen = ''; try { seen = localStorage.getItem(KEY) || ''; } catch (e) {}
  if (seen === NEWS_VERSION) return;
  const done = () => { try { localStorage.setItem(KEY, NEWS_VERSION); } catch (e) {} if (dlg.open) dlg.close(); };
  document.getElementById('nwOk').onclick = done;
  dlg.addEventListener('close', done);
  dlg.showModal();
})();
// "How it works" buttons (header, welcome page and home page) open the guide.
(function () {
  const dlg = document.getElementById('helpdlg'); if (!dlg || !dlg.showModal) return;
  document.querySelectorAll('[data-help]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); if (!dlg.open) dlg.showModal(); }));
})();
