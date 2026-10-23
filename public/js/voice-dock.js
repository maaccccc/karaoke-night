// Voice chat as a floating "chat head" (like Messenger): a round button you can drag anywhere along the screen edge.
// Tap it to open the voice chat panel, tap – (or the head again) to tuck it away. It glows while somebody is talking.
(function () {
  const dock = document.getElementById('vcDock'), head = document.getElementById('vcHead'), panel = document.getElementById('vcPanel');
  if (!dock || !head || !panel) return;
  const S = 58, M = 10;   // head size and screen margin
  let pos = { side: 'l', y: 0.6 };   // side: l | r, y: 0..1 of the free height
  try { const p = JSON.parse(localStorage.getItem('vcHead') || 'null'); if (p && (p.side === 'l' || p.side === 'r') && p.y >= 0 && p.y <= 1) pos = p; } catch (e) {}
  const save = () => { try { localStorage.setItem('vcHead', JSON.stringify(pos)); } catch (e) {} };
  const top = () => { const lo = M + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0), hi = innerHeight - S - M; return Math.max(lo, Math.min(hi, lo + pos.y * (hi - lo))); };

  function place() {
    const t = top(); head.style.top = t + 'px'; head.style.bottom = 'auto';
    head.style.left = pos.side === 'l' ? M + 'px' : 'auto'; head.style.right = pos.side === 'r' ? M + 'px' : 'auto';
    if (panel.hidden) return;
    if (matchMedia('(max-width:560px)').matches) { panel.style.left = panel.style.top = ''; return; }   // phones: CSS makes it a bottom sheet
    const w = panel.offsetWidth, h = panel.offsetHeight;
    panel.style.left = (pos.side === 'r' ? Math.max(M, innerWidth - M - S - 8 - w) : Math.min(innerWidth - w - M, M + S + 8)) + 'px';
    panel.style.top = Math.max(M, Math.min(t + S - h, innerHeight - h - M)) + 'px';
  }
  function open(o) {
    panel.hidden = !o; head.setAttribute('aria-expanded', o ? 'true' : 'false'); head.classList.toggle('open', o); place();
  }
  document.getElementById('vcMin').onclick = () => open(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) open(false); });

  // drag: a small move is a tap (open / close), a bigger one drags the head and it snaps to the nearest side
  let d = null;
  head.addEventListener('pointerdown', e => {
    if (e.button) return; head.setPointerCapture(e.pointerId);
    const r = head.getBoundingClientRect(); d = { x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
  });
  head.addEventListener('pointermove', e => {
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
    d.moved = true; head.classList.add('drag');
    head.style.right = 'auto'; head.style.left = Math.max(M, Math.min(innerWidth - S - M, e.clientX - d.dx)) + 'px'; head.style.top = Math.max(M, Math.min(innerHeight - S - M, e.clientY - d.dy)) + 'px';
  });
  const end = e => {
    if (!d) return; const was = d; d = null; head.classList.remove('drag');
    if (was.moved) {
      const r = head.getBoundingClientRect(), hi = innerHeight - S - 2 * M;
      pos = { side: r.left + S / 2 < innerWidth / 2 ? 'l' : 'r', y: Math.max(0, Math.min(1, (r.top - M) / Math.max(1, hi))) }; save(); place();
    } else if (e.type === 'pointerup') open(panel.hidden);
  };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
  head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(panel.hidden); } });
  addEventListener('resize', place);

  // the badge: how many people are in voice chat; red dot when I am muted
  const bd = document.getElementById('vcBd');
  setInterval(() => {
    const inRoom = room.on, n = inRoom ? (room.peers || []).filter(p => p.vc && !p.away).length : 0;
    bd.textContent = n ? String(n) : ''; bd.style.display = n ? '' : 'none';
    head.classList.toggle('live', !!vc.on); head.classList.toggle('muted', !!(vc.on && vc.muted));
    if (!inRoom && !panel.hidden) open(false);
  }, 400);
  place();
})();
