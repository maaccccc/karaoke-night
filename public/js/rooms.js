// Public / Private choice for newly created rooms. Lives here (not in lobbies.js) so Create a room always works.
let roomVis = 'private';
try { if (localStorage.getItem('karaokeVis') === 'public') roomVis = 'public'; } catch (e) {}
// ---- online rooms (shared queue + live voice from the singer)
const room = { on: false, code: '', id: '', name: '', skew: 0, peers: [], startAt: 0, mic: 'untested' };
function setMic(m) { room.mic = m; if (room.on) roomOp({ op: 'mic', mic: m }); }
const rtc = { pcs: {}, stream: null, remote: null, pend: {}, rctx: null, rems: {}, audio: {}, hooked: new Set(), dly: {}, lat: {}, jb: {} };
let pendingResult = null, awaiting = false;
const micC = () => room.on ? { echoCancellation: !prefs.hp, noiseSuppression: false, latency: { ideal: 0 } } : { echoCancellation: true, noiseSuppression: false };
const isSinger = () => !room.on || (current && (current.sids ? current.sids.includes(room.id) : current.singer === room.name));
const EMOJI = ['🎤', '😎', '🦄', '🐱', '🐶', '🦊', '🐼', '🐸', '🤖', '👽', '🎸', '🍕', '🌟', '🔥', '👑', '🦖'];
const COLORS = ['#ff3d8b', '#35e0ff', '#ffc83d', '#3be58a', '#b388ff', '#ff8a3d', '#ff5252', '#7cb7ff'];
let myAv = null; try { myAv = JSON.parse(localStorage.getItem('karaokeAv')); } catch (e) {}
if (!myAv || !EMOJI.includes(myAv.e) || !COLORS.includes(myAv.c)) myAv = { e: EMOJI[Math.floor(Math.random() * EMOJI.length)], c: COLORS[Math.floor(Math.random() * COLORS.length)] };
const avOf = n => { const p = room.on && room.peers.find(x => x.name === n); return p && p.av || null; };
const avTxt = n => { const a = avOf(n); return a ? a.e + ' ' : ''; };
function buildPickers() {
  ['#avPick', '#avPick2'].forEach(id => {
    const box = $(id); if (!box) return; box.textContent = ''; const wrap = el('div', null, 'pk');
    EMOJI.forEach(e => { const b = el('button', e, 'ghost' + (e === myAv.e ? ' on' : '')); b.type = 'button'; b.onclick = () => setAv({ e, c: myAv.c }); wrap.appendChild(b); });
    box.appendChild(wrap); const cw = el('div', null, 'pk');
    COLORS.forEach(c => { const d = el('i', null, c === myAv.c ? 'on' : ''); d.style.background = c; d.onclick = () => setAv({ e: myAv.e, c }); cw.appendChild(d); });
    box.appendChild(cw);
  });
}
function setAv(a) { myAv = a; try { localStorage.setItem('karaokeAv', JSON.stringify(a)); } catch (e) {} buildPickers(); if (room.on) roomOp({ op: 'avatar', av: a }); }
let aud = { avg: 0, n: 0, mine: 0 };
function renderAud() {
  const b = $('#aud'); b.textContent = ''; if (!room.on || !current) return;
  if (isSinger()) { b.appendChild(el('p', aud.n ? 'Audience ★ ' + aud.avg + ' (' + aud.n + (aud.n === 1 ? ' vote' : ' votes') + ') · +' + Math.round(aud.avg * 2) + ' bonus pts' : 'Waiting for audience stars…', 'note')); return; }
  b.appendChild(el('p', 'Rate ' + whoTxt(current) + '’s song', 'note')); const row = el('div', null, 'stars');
  for (let i = 1; i <= 5; i++) { const s = el('button', i <= aud.mine ? '★' : '☆', 'ghost'); s.onclick = () => { aud.mine = i; roomOp({ op: 'star', n: i }); renderAud(); }; row.appendChild(s); }
  b.appendChild(row); if (aud.n) b.appendChild(el('p', 'Audience ★ ' + aud.avg + ' (' + aud.n + ')', 'note'));
}
function floatReact(m) {      // the reaction floats up from the reactor's own emoji in the crowd row
  if (getComputedStyle($('#stage')).display === 'none') return;
  const d = el('div', m.e, 'rx'); d.appendChild(el('small', m.from));
  const src = [...document.querySelectorAll('#crowd .cav')].find(x => x.dataset.name === m.from);
  if (src) { const b = src.getBoundingClientRect(); d.style.left = (b.left + b.width / 2) + 'px'; d.style.bottom = (innerHeight - b.top - b.height / 2) + 'px'; src.classList.add('hit'); setTimeout(() => src.classList.remove('hit'), 500); }
  else d.style.left = (6 + Math.random() * 82) + '%';
  $('#rxl').appendChild(d); setTimeout(() => d.remove(), 2700);
}
let lastRx = 0;
document.querySelectorAll('#reactBar button').forEach(b => b.onclick = () => { const n = Date.now(); if (n - lastRx < 150) return; lastRx = n; roomOp({ op: 'react', e: b.dataset.e }); });
const modeName = { solo: 'Solo', duet: 'Duet', tournament: 'Tournament' };
const singersOf = it => it.singers && it.singers.length ? it.singers : [it.singer].concat(it.singer2 ? [it.singer2] : []);
const inItem = it => singersOf(it).includes(room.name);
const whoTxt = it => singersOf(it).map(n => avTxt(n) + n).join(' & ');
const myIdx = () => current && current.mode !== 'solo' && current.sids ? current.sids.indexOf(room.id) : -1;
const TOGETHER = 9;      // line marker for "everybody sings this" (singers themselves are numbered 0, 1, 2, ...)
const ownLine = i => { if (!(room.on && current && current.mode !== 'solo' && current.turns)) return true; const v = current.turns[i]; return v === TOGETHER || v === myIdx(); };
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => (b % 36).toString(36)).join('');
async function rpost(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Server error');
  return d;
}
function roomOp(data) { if (HOSTOPS.includes(data.op)) data = Object.assign({ key: roomKey() }, data); return rpost('/api/room/send', { room: room.code, id: room.id, type: 'op', data }).then(d => { if (d.msg) say(d.msg); }).catch(e => say(e.message)); }
function roomRtc(to, data) { return rpost('/api/room/send', { room: room.code, id: room.id, type: 'rtc', to, data }).catch(() => {}); }
async function claimId() {
  let id = ''; try { id = sessionStorage.getItem('karaokeId') || ''; } catch (e) {}
  const hold = n => navigator.locks ? new Promise(res => navigator.locks.request('karaoke-' + n, { ifAvailable: true }, l => l ? (res(true), new Promise(() => {})) : res(false))) : Promise.resolve(true);
  if (!id || !(await hold(id))) { id = rid(); await hold(id); }
  try { sessionStorage.setItem('karaokeId', id); } catch (e) {}
  return id;
}
async function roomJoin(code, name, vis) {   // vis ('public' | 'private') only matters when this join creates the room
  room.id = room.id || await claimId(); try { sessionStorage.setItem('karaokeRoom', code); } catch (e) {}
  const t0 = Date.now(), d = await rpost('/api/room/join', { room: code, id: room.id, name, av: myAv, vis, key: roomKey() }); setRoomKey(d.key);
  room.skew = d.now - (t0 + Date.now()) / 2; room.code = code; room.name = d.name; room.on = true;
  document.body.classList.add('inroom'); say('You are in room ' + code + ' as ' + d.name + '. Share the invite link with friends.');
  const b = $('#roomBtn'); b.style.display = ''; $('#chatBtn').style.display = ''; $('#skipBtn2').style.display = ''; pollLoop(); syncClock(); if (room.mic !== 'untested') roomOp({ op: 'mic', mic: room.mic });
}
async function pollLoop() {
  while (room.on) {
    try {
      const r = await fetch('/api/room/poll?' + new URLSearchParams({ room: room.code, id: room.id }));
      if (r.status === 410) { const j = await rpost('/api/room/join', { room: room.code, id: room.id, name: room.name, av: myAv, key: roomKey() }); setRoomKey(j.key); continue; }
      const d = await r.json(); (d.msgs || []).forEach(handleMsg);
    } catch (e) { if (/banned/.test(e.message)) return kickedOut(true); await new Promise(r => setTimeout(r, 1500)); }
  }
}
function handleMsg(m) {
  if (m.type === 'state') applyState(m);
  else if (m.type === 'kicked') kickedOut(m.ban);
  else if (m.type === 'notice') say(m.text);
  else if (m.type === 'pick') showPick(m);
  else if (m.type === 'pickcancel') { hidePick(); nextStop(); say(m.reason || 'The start was cancelled.'); }
  else if (m.type === 'ready') { hidePick(); showReady(m); }
  else if (m.type === 'readystate') { if (rdIn) { rdIn.yes = m.yes; renderReady(); } }
  else if (m.type === 'readycancel') { hideReady(); nextStop(); say(m.reason || 'The start was cancelled.'); }
  else if (m.type === 'start') { hidePick(); onStart(m); }
  else if (m.type === 'go') onGo(m);
  else if (m.type === 'chat') { addChat(m); fxChat(); }
  else if (m.type === 'hist') { hist.length = 0; hist.push(...(m.hist || [])); }
  else if (m.type === 'night') openNight();
  else if (m.type === 'chatlog') { $('#chatLog').textContent = ''; (m.msgs || []).forEach(x => addChat(x, true)); }
  else if (m.type === 'react') { floatReact(m); fxReact(); }
  else if (m.type === 'stars') { aud.avg = m.avg; aud.n = m.n; if ($('#rate').style.display === 'block') { renderAud(); renderAwards(); } }
  else if (m.type === 'next') { nextInfo = { item: m.item, end: Date.now() + m.in * 1000, secs: m.in }; if ($('#rate').style.display === 'block') nextCountdown(m.in, m.item, false); else say('Next up: ' + m.item.song.title + ' (' + whoTxt(m.item) + ').'); }
  else if (m.type === 'skip') { hideReady(); hidePick(); nextStop(); nextInfo = null; room.prep = false; $('#cd').classList.remove('show'); if (active) leaveSong(); current = null; room.startAt = 0; say(m.reason || ((m.by === room.name ? 'You' : m.by) + ' skipped the song.')); }
  else if (m.type === 'result') onResult(m);
  else if (m.type === 'rtc') (m.data && m.data.vc ? onVc : onRtc)(m.from, m.data);
}
function applyState(m) {
  joinToast(m.peers);
  room.peers = m.peers;
  players.length = 0; players.push(...m.players);
  queue.length = 0; m.queue.forEach(q => queue.push({ id: q.id, song: q.song, singer: q.singer, singer2: q.singer2, singers: q.singers || [], mode: q.mode, file: null }));
  Object.keys(scores).forEach(k => delete scores[k]); Object.assign(scores, m.scores);
  room.last = m; room.host = m.host; room.pub = !!m.public; renderPlayers(); renderQueue(); renderScores(); renderVis(m); renderWho(m); vcSync();
  if (active) crowdBuild();
  $('#roomBtn').textContent = (m.public ? '🌐 Room ' : '🔒 Room ') + room.code + ' · ' + m.peers.length;
  if (pkIn && $('#pickdlg').classList.contains('show')) renderPick();
  if (active && room.on && isSinger() && rtc.stream) connectPeers();
}
function renderWho(m) {
  const box = $('#lobList'); box.textContent = ''; $('#lobN').textContent = '(' + m.peers.length + ')';
  const mic = { untested: ['mic untested', ''], tested: ['mic OK', 'ok'], blocked: ['mic blocked', 'bad'], none: ['no mic', 'bad'], error: ['mic problem', 'bad'] };
  m.peers.forEach(p => {
    const row = el('div', '', 'pr' + (p.away ? ' away' : '')); const av = el('span', (p.av || {}).e || '🎤', 'av'); av.style.background = (p.av || {}).c || '#888'; row.appendChild(av); row.appendChild(el('b', p.name + (p.id === room.id ? ' (you)' : '') + ((m.singers || []).includes(p.name) ? ' 🎤' : ''), p.id === room.id ? 'me' : ''));
    if (p.id === m.host) row.appendChild(el('span', '👑 host', 'tg ok'));
    const [t, c] = mic[p.mic] || mic.untested; row.appendChild(el('span', t, 'tg ' + c));
    if (p.vc) row.appendChild(el('span', p.vcm ? '🔇 muted' : '🎧 voice', 'tg' + (p.vcm ? '' : ' ok')));
    if (m.picking === p.name) row.appendChild(el('span', 'choosing mode…', 'tg ok'));
    if (p.away) row.appendChild(el('span', 'reconnecting…', 'tg'));
    else if (rdIn || p.ready) row.appendChild(el('span', p.ready ? 'ready' : 'not ready', 'tg ' + (p.ready ? 'ok' : '')));
    if (p.id !== room.id) {
      const acts = el('span', null, 'acts'), btn = (txt, tip, fn) => { const b = el('button', txt, 'ghost mini'); b.type = 'button'; b.title = tip; b.onclick = fn; acts.appendChild(b); };
      btn(isMuted(p.name) ? '🔊 Unmute' : '🔇 Mute', 'Only you stop hearing and seeing ' + p.name, () => toggleMute(p.name));
      if (m.host === room.id) {
        btn('👑 Make host', 'Hand the host role to ' + p.name, () => { if (confirm('Make ' + p.name + ' the host? You will lose the host tools.')) roomOp({ op: 'host', id: p.id }); });
        btn('Kick', 'Remove ' + p.name + ' (they can join again)', () => { if (confirm('Kick ' + p.name + ' out of the room? They can join again.')) roomOp({ op: 'kick', id: p.id }); });
        btn('Ban', 'Remove ' + p.name + ' and block them from rejoining', () => { if (confirm('Ban ' + p.name + '? They will not be able to rejoin this room.')) roomOp({ op: 'ban', id: p.id }); });
      }
      row.appendChild(acts);
    }
    box.appendChild(row);
  });
  $('#skipBtn').disabled = $('#skipBtn2').disabled = !m.busy && !rdIn && !m.picking;
}
$('#skipBtn').onclick = $('#skipBtn2').onclick = () => roomOp({ op: 'skip' });

// ---- host tools, public/private, and muting people just for you
const HOSTOPS = ['kick', 'ban', 'unban', 'vis', 'host'];
function roomKey() { if (room.key) return room.key; try { return sessionStorage.getItem('karaokeKey') || undefined; } catch (e) { return undefined; } }   // secret that proves you are you (needed for host tools)
function setRoomKey(k) { room.key = k; try { sessionStorage.setItem('karaokeKey', k || ''); } catch (e) {} }
function kickedOut(banned) {
  room.on = false; try { sessionStorage.removeItem('karaokeRoom'); } catch (e) {}
  alert(banned ? 'The host banned you from this room.' : 'The host removed you from the room.'); location.href = location.pathname;
}
function renderVis(m) {
  const t = $('#visTag'), b = $('#visBtn'), host = m.host === room.id;
  t.textContent = m.public ? '🌐 Public room' : '🔒 Private room'; t.className = 'vb ' + (m.public ? 'pub' : 'priv');
  $('#visNote').textContent = m.public ? 'Listed on the home page with its code, so anyone can find and join it.' : 'Shown on the home page as private, without its code. Only people with your link or code can join.';
  b.style.display = host ? '' : 'none'; b.textContent = m.public ? 'Make private' : 'Make public'; b.onclick = () => roomOp({ op: 'vis', public: !m.public });
  const bl = $('#banList'); bl.textContent = ''; bl.style.display = host && (m.bans || []).length ? '' : 'none';
  if (host && (m.bans || []).length) {
    bl.appendChild(el('b', 'Banned', 'note'));
    m.bans.forEach(n => { const r = el('div', null, 'bn'); r.appendChild(el('span', n)); const u = el('button', 'Unban', 'ghost mini'); u.type = 'button'; u.onclick = () => roomOp({ op: 'unban', name: n }); r.appendChild(u); bl.appendChild(r); });
  }
}
const mutedNames = new Set(); try { JSON.parse(sessionStorage.getItem('karaokeMuted') || '[]').forEach(n => mutedNames.add(n)); } catch (e) {}
const isMuted = n => mutedNames.has(n);
const isMutedId = id => { const p = (room.peers || []).find(x => x.id === id); return !!p && isMuted(p.name); };
function toggleMute(name) {   // local only: you stop hearing (voice chat and singing) and seeing (chat) this person; nobody else is affected
  if (mutedNames.has(name)) mutedNames.delete(name); else mutedNames.add(name);
  try { sessionStorage.setItem('karaokeMuted', JSON.stringify([...mutedNames])); } catch (e) {}
  applyMutes(); if (room.last) renderWho(room.last); say(isMuted(name) ? 'You muted ' + name + '. Only you stop hearing and seeing them.' : 'You unmuted ' + name + '.');
}
function applyMutes() {
  Object.entries(vc.audio || {}).forEach(([id, a]) => { a.muted = isMutedId(id); });
  Object.entries(rtc.audio || {}).forEach(([id, a]) => { a.muted = isMutedId(id); });
  const rv = $('#rv'); if (rv) rv.muted = Object.entries(rtc.rems || {}).some(([id, s]) => s === rv.srcObject && isMutedId(id));
}

