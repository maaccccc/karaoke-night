// Sidebar and room cards can be minimised: click a card title (or press Enter / Space on it). The choice is remembered.
(function () {
  const KEY = 'kn.collapsed'; let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  function enhance(card) {
    if (card.dataset.fold) return;
    const h = card.querySelector(':scope > h2'); if (!h) return;
    const label = (h.firstChild && h.firstChild.textContent || h.textContent).trim().toLowerCase().replace(/\s+/g, '-');
    const id = card.id || label; card.dataset.fold = id;
    h.classList.add('fold-h'); h.tabIndex = 0; h.setAttribute('role', 'button');
    const set = c => { card.classList.toggle('collapsed', c); h.setAttribute('aria-expanded', c ? 'false' : 'true'); };
    set(!!st[id]);
    const flip = () => { const c = !card.classList.contains('collapsed'); set(c); if (c) st[id] = 1; else delete st[id]; save(); };
    h.addEventListener('click', e => { if (e.target.closest('button,a,input')) return; flip(); });
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  }
  const scan = () => document.querySelectorAll('#side .card, #home .card').forEach(enhance);
  scan();
  ['sideCards', 'home'].forEach(id => { const n = document.getElementById(id); if (n) new MutationObserver(scan).observe(n, { childList: true }); });
})();
