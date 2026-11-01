// "More" menu in the header: opens on click, closes on outside click, Escape, or after choosing an item.
(function () {
  const btn = document.getElementById('moreBtn'), menu = document.getElementById('moreMenu');
  if (!btn || !menu) return;
  const set = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); };
  btn.addEventListener('click', e => { e.stopPropagation(); set(menu.hidden); });
  menu.addEventListener('click', () => setTimeout(() => set(false), 0));
  document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== btn) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
})();
