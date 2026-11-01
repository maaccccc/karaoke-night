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
    if (panel.hidden || panel.classList.contains('floating')) return;
    if (matchMedia('(max-width:999px), (hover:none) and (pointer:coarse)').matches) { panel.style.left = panel.style.top = ''; return; }   // phones: CSS makes it a bottom sheet
    const w = panel.offsetWidth, h = panel.offsetHeight;
    panel.style.left = (pos.side === 'r' ? Math.max(M, innerWidth - M - S - 8 - w) : Math.min(innerWidth - w - M, M + S + 8)) + 'px';
    panel.style.top = Math.max(M, Math.min(t + S / 2 - h / 2, innerHeight - h - M)) + 'px';      // centered on the bubble, always fully on screen
  }
  // the panel changes height when you join or leave voice chat (mute button, sliders, tip appear): put it back in the right place every time
  if (window.ResizeObserver) new ResizeObserver(() => { if (!panel.hidden && !panel.classList.contains('floating')) place(); }).observe(panel);
  const vpane = document.getElementById('vcVoicePane'), cpane = document.getElementById('vcChatPane'), tabs = [...panel.querySelectorAll('.vct')];
  let tab = 'voice';
  function setTab(t) {       // one combined panel now: voice on top, chat below (the tab only decides whether the chat box gets the cursor)
    tab = t === 'chat' ? 'chat' : 'voice'; vpane.hidden = false; cpane.hidden = false;
    if (tab === 'chat' && !panel.hidden) { const i = document.getElementById('chatIn'); if (i) setTimeout(() => i.focus(), 50); }
  }
  function open(o, t) {
    if (t) setTab(t); else if (!o) { /* keep the tab for next time */ }
    panel.hidden = !o; head.setAttribute('aria-expanded', o ? 'true' : 'false'); head.classList.toggle('open', o);
    if (o) { setTab(t === 'chat' ? 'chat' : 'voice'); if (typeof chatSeen === 'function') chatSeen(); } place();
  }
  tabs.forEach(b => b.onclick = () => { setTab(b.dataset.t); place(); });
  window.vcDock = { open, shows: t => !panel.hidden };

  // phones: the room chat moves into the bubble (its Chat tab); on a PC it stays in the side column
  const chat = document.getElementById('chat'), side = document.getElementById('side'), mq = matchMedia('(max-width:999px), (hover:none) and (pointer:coarse)');
  function chatPlace() {      // the room chat always lives inside the bubble panel, on every screen size
    if (!chat) return;
    chat.classList.remove('min'); if (chat.parentNode !== cpane) cpane.appendChild(chat);
    dock.classList.add('phone');
    if (typeof chatLabel === 'function') chatLabel(); place();
  }
  (mq.addEventListener ? mq.addEventListener('change', chatPlace) : mq.addListener(chatPlace));
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
  // ---- detach: on screens at least 641px wide the panel can become a floating window you drag (by its title bar) and resize (corner), and leave anywhere
  const win = { on: false, x: 40, y: 90, w: 380, h: 480 }, dt = document.getElementById('vcDetach'), rz = document.getElementById('vcResize'), hdr = panel.querySelector('.vcph');
  try { const s = JSON.parse(localStorage.getItem('vcWin') || 'null'); if (s && typeof s === 'object') Object.assign(win, s); } catch (e) {}
  const saveWin = () => { try { localStorage.setItem('vcWin', JSON.stringify(win)); } catch (e) {} };
  const canFloat = () => matchMedia('(min-width:641px)').matches, cl = (v, a, b) => Math.max(a, Math.min(b, v));
  function applyWin() {
    const f = !!win.on && canFloat(); panel.classList.toggle('floating', f);
    dt.textContent = f ? '⇲' : '⧉'; dt.title = f ? 'Dock: put it back next to the bubble' : 'Detach: float this window anywhere on the screen'; dt.setAttribute('aria-label', f ? 'Dock' : 'Detach');
    if (f) {
      win.w = cl(win.w, 290, innerWidth - 16); win.h = cl(win.h, 270, innerHeight - 16); win.x = cl(win.x, 0, innerWidth - win.w); win.y = cl(win.y, 0, innerHeight - win.h);
      Object.assign(panel.style, { left: win.x + 'px', top: win.y + 'px', width: win.w + 'px', height: win.h + 'px', right: 'auto', bottom: 'auto' });
    } else ['left', 'top', 'width', 'height', 'right', 'bottom'].forEach(k => { panel.style[k] = ''; });
  }
  dt.onclick = () => {
    if (!win.on) { const r = panel.getBoundingClientRect(); Object.assign(win, { on: true, x: r.left, y: r.top, w: r.width, h: r.height }); }   // it stays exactly where it is
    else win.on = false;
    saveWin(); applyWin(); place();
  };
  hdr.addEventListener('pointerdown', e => {
    if (!panel.classList.contains('floating') || e.button || e.target.closest('button')) return;
    hdr.setPointerCapture(e.pointerId); const sx = e.clientX - win.x, sy = e.clientY - win.y;
    const mv = ev => { win.x = cl(ev.clientX - sx, 0, innerWidth - win.w); win.y = cl(ev.clientY - sy, 0, innerHeight - win.h); panel.style.left = win.x + 'px'; panel.style.top = win.y + 'px'; };
    const up = () => { hdr.removeEventListener('pointermove', mv); hdr.removeEventListener('pointerup', up); hdr.removeEventListener('pointercancel', up); saveWin(); };
    hdr.addEventListener('pointermove', mv); hdr.addEventListener('pointerup', up); hdr.addEventListener('pointercancel', up);
  });
  rz.addEventListener('pointerdown', e => {
    if (e.button) return; e.preventDefault(); rz.setPointerCapture(e.pointerId); const sx = e.clientX, sy = e.clientY, w0 = win.w, h0 = win.h;
    const mv = ev => { win.w = cl(w0 + ev.clientX - sx, 290, innerWidth - win.x); win.h = cl(h0 + ev.clientY - sy, 270, innerHeight - win.y); panel.style.width = win.w + 'px'; panel.style.height = win.h + 'px'; };
    const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); rz.removeEventListener('pointercancel', up); saveWin(); };
    rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
  });
  addEventListener('resize', () => { applyWin(); place(); });

  // the badge: how many people are in voice chat; red dot when I am muted
  const bd = document.getElementById('vcBd');
  setInterval(() => {
    const inRoom = room.on, n = inRoom ? (room.peers || []).filter(p => p.vc && !p.away).length : 0;
    bd.textContent = n ? String(n) : ''; bd.style.display = n ? 'grid' : 'none';
    const ub = document.getElementById('vcTabBd'), hu = head.querySelector('.vcub') || head.appendChild(Object.assign(document.createElement('span'), { className: 'vcub' })), un = (dock.classList.contains('phone') && typeof chatUnread === 'number') ? chatUnread : 0;
    [ub, hu].forEach(x => { x.textContent = un ? String(un) : ''; x.style.display = un ? 'inline-block' : 'none'; });
    head.classList.toggle('live', !!vc.on); head.classList.toggle('muted', !!(vc.on && vc.muted));
    if (!inRoom && !panel.hidden) open(false);
  }, 400);
  chatPlace(); applyWin(); place();
})();
