// Slide-down notice when someone joins your room's lobby. Called from applyState() in rooms.js.
let jtKnown = null, jtRoom = '', jtLast = 0;
function joinToast(peers) {
  const now = Date.now();
  if (jtRoom !== room.code || now - jtLast > 60000) jtKnown = null;      // first state after joining (or coming back): stay silent
  jtRoom = room.code; jtLast = now;
  if (jtKnown) peers.forEach(p => { if (p.id !== room.id && !jtKnown.has(p.name)) showJoinToast(p); });
  jtKnown = new Set(peers.map(p => p.name));
}
function showJoinToast(p) {
  let box = document.getElementById('joinToasts');
  if (!box) { box = document.createElement('div'); box.id = 'joinToasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'jt';
  const av = document.createElement('span'); av.className = 'jtav'; av.textContent = (p.av || {}).e || '🎤'; av.style.background = (p.av || {}).c || '#888';
  const tx = document.createElement('span'); tx.textContent = p.name + ' joined the lobby';
  t.append(av, tx); box.appendChild(t);
  t.addEventListener('animationend', () => t.remove());
}
