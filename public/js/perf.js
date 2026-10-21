// "Smooth mode" switch in Settings. It uses the same lite mode that premium.js turns on automatically for slow devices.
(() => {
  const B = document.body, cb = document.getElementById('pLite');
  if (!cb) return;
  const sync = () => { cb.checked = B.classList.contains('lite'); };
  cb.onchange = () => {
    B.classList.toggle('lite', cb.checked);
    try { localStorage.setItem('karaokeLite', cb.checked ? '1' : '0'); } catch (e) {}
    if (cb.checked) { fxVar.reset('--lights'); fxVar.reset('--beat'); }
  };
  ['#gear', '#lSettings'].forEach(s => { const b = document.querySelector(s); if (b) b.addEventListener('click', sync); });
  sync();
})();
