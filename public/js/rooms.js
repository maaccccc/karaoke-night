// ---- online rooms (shared queue + live voice from the singer)
const room = { on: false, code: '', id: '', name: '', skew: 0, peers: [], startAt: 0, mic: 'untested' };
function setMic(m) { room.mic = m; if (room.on) roomOp({ op: 'mic', mic: m }); }
const rtc = { pcs: {}, stream: null, remote: null, pend: {}, rctx: null, rems: {}, audio: {}, hooked: new Set(), dly: {}, lat: {} };
let pendingResult = null, awaiting = false;
const micC = () => room.on ? { echoCancellation: !prefs.hp, noiseSuppression: false } : { echoCancellation: true, noiseSuppression: false };
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
function roomOp(data) { return rpost('/api/room/send', { room: room.code, id: room.id, type: 'op', data }).then(d => { if (d.msg) say(d.msg); }).catch(e => say(e.message)); }
function roomRtc(to, data) { return rpost('/api/room/send', { room: room.code, id: room.id, type: 'rtc', to, data }).catch(() => {}); }
async function claimId() {
  let id = ''; try { id = sessionStorage.getItem('karaokeId') || ''; } catch (e) {}
  const hold = n => navigator.locks ? new Promise(res => navigator.locks.request('karaoke-' + n, { ifAvailable: true }, l => l ? (res(true), new Promise(() => {})) : res(false))) : Promise.resolve(true);
  if (!id || !(await hold(id))) { id = rid(); await hold(id); }
  try { sessionStorage.setItem('karaokeId', id); } catch (e) {}
  return id;
}
async function roomJoin(code, name) {
  room.id = room.id || await claimId(); try { sessionStorage.setItem('karaokeRoom', code); } catch (e) {}
  const t0 = Date.now(), d = await rpost('/api/room/join', { room: code, id: room.id, name, av: myAv });
  room.skew = d.now - (t0 + Date.now()) / 2; room.code = code; room.name = d.name; room.on = true;
  document.body.classList.add('inroom'); say('You are in room ' + code + ' as ' + d.name + '. Share the invite link with friends.');
  const b = $('#roomBtn'); b.style.display = ''; $('#chatBtn').style.display = ''; $('#skipBtn2').style.display = ''; pollLoop(); syncClock(); if (room.mic !== 'untested') roomOp({ op: 'mic', mic: room.mic });
}
async function pollLoop() {
  while (room.on) {
    try {
      const r = await fetch('/api/room/poll?' + new URLSearchParams({ room: room.code, id: room.id }));
      if (r.status === 410) { await rpost('/api/room/join', { room: room.code, id: room.id, name: room.name, av: myAv }); continue; }
      const d = await r.json(); (d.msgs || []).forEach(handleMsg);
    } catch (e) { await new Promise(r => setTimeout(r, 1500)); }
  }
}
function handleMsg(m) {
  if (m.type === 'state') applyState(m);
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
  renderPlayers(); renderQueue(); renderScores(); renderWho(m); vcSync();
  if (active) crowdBuild();
  $('#roomBtn').textContent = '🌐 Room ' + room.code + ' · ' + m.peers.length;
  if (pkIn && $('#pickdlg').classList.contains('show')) renderPick();
  if (active && room.on && isSinger() && rtc.stream) connectPeers();
}
function renderWho(m) {
  const box = $('#lobList'); box.textContent = ''; $('#lobN').textContent = '(' + m.peers.length + ')';
  const mic = { untested: ['mic untested', ''], tested: ['mic OK', 'ok'], blocked: ['mic blocked', 'bad'], none: ['no mic', 'bad'], error: ['mic problem', 'bad'] };
  m.peers.forEach(p => {
    const row = el('div', '', 'pr' + (p.away ? ' away' : '')); const av = el('span', (p.av || {}).e || '🎤', 'av'); av.style.background = (p.av || {}).c || '#888'; row.appendChild(av); row.appendChild(el('b', p.name + (p.id === room.id ? ' (you)' : '') + ((m.singers || []).includes(p.name) ? ' 🎤' : ''), p.id === room.id ? 'me' : ''));
    const [t, c] = mic[p.mic] || mic.untested; row.appendChild(el('span', t, 'tg ' + c));
    if (p.vc) row.appendChild(el('span', p.vcm ? '🔇 muted' : '🎧 voice', 'tg' + (p.vcm ? '' : ' ok')));
    if (m.picking === p.name) row.appendChild(el('span', 'choosing mode…', 'tg ok'));
    if (p.away) row.appendChild(el('span', 'reconnecting…', 'tg'));
    else if (rdIn || p.ready) row.appendChild(el('span', p.ready ? 'ready' : 'not ready', 'tg ' + (p.ready ? 'ok' : '')));
    box.appendChild(row);
  });
  $('#skipBtn').disabled = $('#skipBtn2').disabled = !m.busy && !rdIn && !m.picking;
}
$('#skipBtn').onclick = $('#skipBtn2').onclick = () => roomOp({ op: 'skip' });
