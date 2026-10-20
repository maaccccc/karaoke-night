// Home page: Private / Public choice for a new room, and the live Room lobby list (/api/rooms).
// roomVis is declared in rooms.js (loaded earlier) and read by mode-picker.js when a room is created.
(function () {
  const btns = [...document.querySelectorAll('.visp button.seg')];
  const box = document.getElementById('lobRooms'), note = document.getElementById('lobNote');

  // ---- Private / Public choice
  function paintVis() {
    btns.forEach(b => { const on = b.dataset.v === roomVis; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  btns.forEach(b => b.addEventListener('click', () => {
    roomVis = b.dataset.v === 'public' ? 'public' : 'private';
    try { localStorage.setItem('karaokeVis', roomVis); } catch (e) {}
    paintVis();
  }));
  paintVis();

  // ---- Room lobby
  if (!box) return;
  function joinPublic(code) {
    const name = document.getElementById('rName');
    document.getElementById('rCode').value = code;
    if (!name.value.trim()) { note.textContent = 'Enter your name first, then tap Join again.'; name.focus(); return; }
    note.textContent = '';
    document.getElementById('lJoin').click();
  }
  function row(r) {
    const d = el('div', null, 'rrow');
    const av = el('span', (r.av && r.av.e) || '🎤', 'rav'); av.style.background = (r.av && r.av.c) || '#888'; d.appendChild(av);
    const info = el('div', null, 'rinfo');
    info.appendChild(el('b', r.host + '’s room' + (r.public ? ' · ' + r.code : '')));
    const bits = [r.n + (r.n === 1 ? ' person' : ' people')];
    if (r.public) bits.push(r.singing ? '🎤 ' + (r.song || 'singing now') : 'waiting for a song');
    else bits.push(r.singing ? 'singing now' : 'waiting for a song');
    info.appendChild(el('small', bits.join(' · '))); d.appendChild(info);
    d.appendChild(el('span', r.public ? '🌐 Public' : '🔒 Private', 'vb ' + (r.public ? 'pub' : 'priv')));
    if (r.public) { const b = el('button', 'Join'); b.type = 'button'; b.onclick = () => joinPublic(r.code); d.appendChild(b); }
    return d;
  }
  function render(rooms) {
    box.textContent = '';
    if (!rooms.length) { box.appendChild(el('p', 'No rooms are open right now. Create one and it will show up here.', 'note')); return; }
    rooms.forEach(r => box.appendChild(row(r)));
  }
  let busy = false;
  async function refresh() {
    if (busy || document.hidden || !document.body.classList.contains('home')) return;
    busy = true;
    try { const r = await fetch('/api/rooms'); render((await r.json()).rooms || []); }
    catch (e) { box.textContent = ''; box.appendChild(el('p', 'Could not load the room list.', 'note')); }
    busy = false;
  }
  refresh(); setInterval(refresh, 4000);
  document.addEventListener('visibilitychange', refresh);
})();
