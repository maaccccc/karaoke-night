// the themed confirm/alert boxes come from dialog.js; if that file is not installed, fall back to the browser's own boxes
if (!window.kConfirm) { window.kConfirm = async m => window.confirm(m); window.kAlert = async m => { window.alert(m); }; }
// Public / Private choice for newly created rooms. Lives here (not in lobbies.js) so Create a room always works.
let roomVis = 'private';
try { if (localStorage.getItem('karaokeVis') === 'public') roomVis = 'public'; } catch (e) {}
// ---- online rooms (shared queue + live voice from the singer)
const room = { on: false, code: '', id: '', name: '', skew: 0, peers: [], startAt: 0, mic: 'untested' };
function setMic(m) { room.mic = m; if (room.on) roomOp({ op: 'mic', mic: m }); }
const rtc = { pcs: {}, stream: null, remote: null, pend: {}, rctx: null, rems: {}, audio: {}, hooked: new Set(), dly: {}, lat: {}, jb: {} };
let pendingResult = null, awaiting = false;
const micC = () => Object.assign(room.on ? { echoCancellation: !prefs.hp, latency: { ideal: 0 } } : { echoCancellation: true }, supCons(prefs.sup, 'sing'));   // Mic suppression decides the browser's noise suppression (Standard = off while singing, as before)
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
    if (id === '#avPick2') { const pv = el('div', myAv.e, 'pkprev'); pv.style.setProperty('--ac', myAv.c); pv.setAttribute('aria-hidden', 'true'); box.appendChild(pv); }   // live preview of your look
    EMOJI.forEach(e => { const b = el('button', e, 'ghost' + (e === myAv.e ? ' on' : '')); b.type = 'button'; b.onclick = () => setAv({ e, c: myAv.c }); wrap.appendChild(b); });
    box.appendChild(wrap); const cw = el('div', null, 'pk');
    COLORS.forEach(c => { const d = el('i', null, c === myAv.c ? 'on' : ''); d.style.background = c; d.onclick = () => setAv({ e: myAv.e, c });
      d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', 'Colour ' + c); d.setAttribute('aria-pressed', c === myAv.c);
      d.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); d.onclick(); } }; cw.appendChild(d); });
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
  if (body && body.room) body.tab = TAB;
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Server error');
  return d;
}
function roomOp(data) { if (HOSTOPS.includes(data.op)) data = Object.assign({ key: roomKey() }, data); return rpost('/api/room/send', { room: room.code, id: room.id, type: 'op', data }).then(d => { if (d.msg) say(d.msg); }).catch(e => say(e.message)); }
function roomRtc(to, data) { return rpost('/api/room/send', { room: room.code, id: room.id, type: 'rtc', to, data }).catch(() => {}); }
async function roomJoin(code, name, vis) {   // vis ('public' | 'private') only matters when this join creates the room
  room.id = deviceId('room:' + code); room.key = undefined; try { sessionStorage.setItem('karaokeRoom', code); } catch (e) {}   // one seat per device and room, whatever the number of tabs
  const keepLast = () => { try { localStorage.setItem('karaokeLast', JSON.stringify({ code, id: room.id, key: room.key || roomKey(code) || '', t: Date.now() })); } catch (e) {} }; keepLast();
  const t0 = Date.now(), d = await rpost('/api/room/join', { room: code, id: room.id, name, av: myAv, vis, key: roomKey(code) }); setRoomKey(d.key, code); keepLast();
  room.skew = d.now - (t0 + Date.now()) / 2; room.code = code; room.name = d.name; room.on = true;
  document.body.classList.add('inroom'); say('You are in room ' + code + ' as ' + d.name + '. Share the invite link with friends.');
  const b = $('#roomBtn'); b.style.display = ''; $('#chatBtn').style.display = ''; $('#skipBtn2').style.display = ''; pollLoop(); syncClock(); if (room.mic !== 'untested') roomOp({ op: 'mic', mic: room.mic });
}
async function pollLoop() {
  while (room.on) {
    try {
      const r = await fetch('/api/room/poll?' + new URLSearchParams({ room: room.code, id: room.id, tab: TAB }));
      if (r.status === 410) { const j = await rpost('/api/room/join', { room: room.code, id: room.id, name: room.name, av: myAv, key: roomKey() }); setRoomKey(j.key, room.code); continue; }
      const d = await r.json(); (d.msgs || []).forEach(handleMsg);
    } catch (e) { if (/banned/.test(e.message)) return kickedOut(true); await new Promise(r => setTimeout(r, 1500)); }
  }
}
function handleMsg(m) {
  if (m.type === 'state') applyState(m);
  else if (m.type === 'kicked') kickedOut(m.ban);
  else if (m.type === 'replaced') replacedOut();
  else if (m.type === 'notice') say(m.text);
  else if (m.type === 'shift') { if (room.live) room.live.at = m.at; if (room.startAt) { room.startAt = m.at; lastSeek = 0; } }   // a singer skipped the intro: the shared clock moved forward, the sync loop seeks every video
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
  else if (m.type === 'timing') onTiming(m);
  else if (m.type === 'stars') { aud.avg = m.avg; aud.n = m.n; if ($('#rate').style.display === 'block') { renderAud(); renderAwards(); } }
  else if (m.type === 'next') { nextInfo = { item: m.item, end: Date.now() + m.in * 1000, secs: m.in }; if ($('#rate').style.display === 'block') nextCountdown(m.in, m.item, false); else say('Next up: ' + m.item.song.title + ' (' + whoTxt(m.item) + ').'); }
  else if (m.type === 'live') { room.live = m; refreshLive(); }
  else if (m.type === 'skip') { room.live = null; refreshLive(); hideReady(); hidePick(); nextStop(); nextInfo = null; room.prep = false; $('#cd').classList.remove('show'); if (active) leaveSong(); current = null; room.startAt = 0; say(m.reason || ((m.by === room.name ? 'You' : m.by) + ' skipped the song.')); }
  else if (m.type === 'result') { room.live = null; refreshLive(); onResult(m); }
  else if (m.type === 'rtc') (m.data && m.data.vc ? onVc : onRtc)(m.from, m.data);
}
function applyState(m) {
  joinToast(m.peers);
  room.peers = m.peers;
  players.length = 0; players.push(...m.players);
  queue.length = 0; m.queue.forEach(q => queue.push({ id: q.id, song: q.song, singer: q.singer, singer2: q.singer2, singers: q.singers || [], mode: q.mode, file: null }));
  Object.keys(scores).forEach(k => delete scores[k]); Object.assign(scores, m.scores);
  if (!m.busy && room.live) room.live = null; refreshLive();
  room.last = m; room.host = m.host; room.pub = !!m.public; renderPlayers(); renderQueue(); renderScores(); renderVis(m); renderWho(m); vcSync();
  renderSkip(m);
  if (active) crowdBuild();
  $('#roomBtn').textContent = (m.public ? '🌐 Room ' : '🔒 Room ') + room.code + ' · ' + m.peers.length;
  const wc = $('#whoCode'); if (wc) wc.textContent = room.code;
  if (pkIn && $('#pickdlg').classList.contains('show')) renderPick();
  if (active && room.on && isSinger() && rtc.stream) connectPeers();
}
// ---- joined while a song is already playing: show a button that opens the karaoke only if the person wants to see it
function refreshLive() {
  const bar = $('#liveBar'); if (!bar) return;
  const m = room.live, show = !!(room.on && m && !active && !room.watch);
  bar.style.display = show ? '' : 'none';
  if (show) $('#liveTxt').textContent = '🎤 ' + whoTxt(m.item) + (singersOf(m.item).length > 1 ? ' are singing: ' : ' is singing: ') + m.item.song.title;
}
function watchLive() {
  const m = room.live; if (!m || active || !room.on) return;
  room.watch = true; refreshLive(); applyMutes();          // from now on the singer's voice is allowed to play
  nextStop(); nextInfo = null; aud = { avg: 0, n: 0, mine: 0 };
  room.prep = !!m.prep && !m.at; room.startAt = m.at || 0; loadedSent = true; prebuf = false; holding = false;   // loadedSent: the room did not wait for us, so do not report "ready"
  current = { song: m.item.song, singer: m.item.singer, singer2: m.item.singer2 || '', singers: m.item.singers || [], mode: m.item.mode || 'solo', sids: m.sids, seed: m.seed || 1, theme: m.item.theme || 'neon', file: null };
  pendingResult = null; awaiting = false; say('Loading lyrics…'); loadAndRun();
}
$('#watchBtn').onclick = watchLive;
function renderWho(m) {
  const box = $('#lobList'); box.textContent = ''; $('#lobN').textContent = '(' + m.peers.length + ')';
  const mic = { untested: ['mic untested', ''], tested: ['mic OK', 'ok'], blocked: ['mic blocked', 'bad'], none: ['no mic', 'bad'], error: ['mic problem', 'bad'] };
  m.peers.forEach(p => {
    const row = el('div', '', 'pr' + (p.away ? ' away' : '')); row.dataset.pid = p.id; if (p.id !== room.id) row.title = 'Click or hover to change ' + p.name + '’s volume'; const av = el('span', (p.av || {}).e || '🎤', 'av'); av.style.background = (p.av || {}).c || '#888'; row.appendChild(av); row.appendChild(el('b', p.name + (p.id === room.id ? ' (you)' : '') + ((m.singers || []).includes(p.name) ? ' 🎤' : ''), p.id === room.id ? 'me' : ''));
    if (p.id === m.host) row.appendChild(el('span', '👑 host', 'tg ok'));
    const [t, c] = mic[p.mic] || mic.untested; row.appendChild(el('span', t, 'tg ' + c));
    if (p.vc) row.appendChild(el('span', p.vcm ? '🔇 muted' : '🎧 voice', 'tg' + (p.vcm ? '' : ' ok')));
    if (m.picking === p.name) row.appendChild(el('span', 'choosing mode…', 'tg ok'));
    if (p.away) row.appendChild(el('span', 'reconnecting…', 'tg'));
    else if (rdIn || p.ready) row.appendChild(el('span', p.ready ? 'ready' : 'not ready', 'tg ' + (p.ready ? 'ok' : '')));
    if (p.vc && !p.away && vc.on) {   // input bar right under this person (moved by vcTick); mine shows that my own mic works
      const mt = el('div', null, 'lmeter'); mt.dataset.lm = p.id; mt.appendChild(el('i'));
      mt.title = p.id === room.id ? 'Your microphone level: this is what the room hears' : p.name + '’s microphone level';
      row.appendChild(mt);
    }
    if (p.id !== room.id) {
      const acts = el('span', null, 'acts'), btn = (txt, tip, fn) => { const b = el('button', txt, 'ghost mini'); b.type = 'button'; b.title = tip; b.onclick = fn; acts.appendChild(b); };
      btn(isMuted(p.name) ? '🔊 Unmute' : '🔇 Mute', 'Only you stop hearing and seeing ' + p.name, () => toggleMute(p.name));
      if (m.host === room.id) {
        btn('👑 Make host', 'Hand the host role to ' + p.name, async () => { if (await kConfirm('Make ' + p.name + ' the host? You will lose the host tools.', { title: 'Hand over the host role?', ok: 'Make host' })) roomOp({ op: 'host', id: p.id }); });
        btn('Kick', 'Remove ' + p.name + ' (they can join again)', async () => { if (await kConfirm('Kick ' + p.name + ' out of the room? They can join again.', { title: 'Kick ' + p.name + '?', ok: 'Kick', danger: true })) roomOp({ op: 'kick', id: p.id }); });
        btn('Ban', 'Remove ' + p.name + ' and block them from rejoining', async () => { if (await kConfirm('Ban ' + p.name + '? They will not be able to rejoin this room.', { title: 'Ban ' + p.name + '?', ok: 'Ban', danger: true })) roomOp({ op: 'ban', id: p.id }); });
      }
      row.appendChild(acts);
    }
    box.appendChild(row);
  });
  $('#skipBtn').disabled = $('#skipBtn2').disabled = !m.busy && !rdIn && !m.picking;
}
// Skip: the host skips for everyone at once; everybody else votes, and the song is skipped when more than half agree.
function renderSkip(m) {
  const host = m.host === room.id, v = m.skipVotes || [], mine = v.includes(room.id);
  const txt = host ? 'Skip for everyone (host)' : (mine ? '✓ Voted to skip ' : '🗳 Vote to skip ') + '(' + v.length + '/' + (m.skipNeed || 1) + ')';
  const tip = host ? 'You are the host: this skips the song for everybody right away' : 'The song is skipped when more than half of the room votes. Press again to take your vote back';
  [$('#skipBtn'), $('#skipBtn2')].forEach(b => { if (b) { b.textContent = txt; b.title = tip; } });
}
$('#inviteBtn').onclick = () => $('#roomBtn').click();      // same as the Room button in the header: invite link + QR code
$('#skipBtn').onclick = $('#skipBtn2').onclick = () => roomOp({ op: room.host === room.id ? 'skip' : 'skipvote' });

// ---- host tools, public/private, and muting people just for you
const HOSTOPS = ['kick', 'ban', 'unban', 'vis', 'host', 'skip'];
function roomKey(code) { if (room.key) return room.key; code = code || room.code; try { const m = JSON.parse(localStorage.getItem('karaokeKeys') || '{}'); return (m[code] && m[code].k) || undefined; } catch (e) { return undefined; } }   // secret that proves you are you (needed for host tools)
function setRoomKey(k, code) {
  room.key = k; code = code || room.code; if (!code) return;
  try { const m = JSON.parse(localStorage.getItem('karaokeKeys') || '{}'), now = Date.now(); m[code] = { k, t: now }; Object.keys(m).forEach(c => { if (now - m[c].t > 24 * 3600 * 1000) delete m[c]; }); localStorage.setItem('karaokeKeys', JSON.stringify(m)); } catch (e) {}
}
// This room was opened in another tab of the same device: that tab now holds the seat, so this one stops (it must NOT rejoin, or the tabs would fight).
let _roomGone = false;   // show the "you were disconnected" box once, even if the server tells us twice
async function replacedOut() {
  room.on = false; try { sessionStorage.removeItem('karaokeRoom'); } catch (e) {}
  if (_roomGone) return; _roomGone = true; await kAlert('This room was opened in another tab on this device, so this tab was disconnected. You can only be in a room once per device.', { title: 'Disconnected', ok: 'OK' });
  location.href = location.pathname;
}
async function kickedOut(banned) {
  room.on = false; try { sessionStorage.removeItem('karaokeRoom'); localStorage.removeItem('karaokeLast'); } catch (e) {}
  if (_roomGone) return; _roomGone = true; await kAlert(banned ? 'The host banned you from this room.' : 'The host removed you from the room.', { title: banned ? 'You were banned' : 'You were removed', ok: 'OK' }); location.href = location.pathname;
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
  const hold = !!room.live && !room.watch;                  // joined mid-song and not watching: do not play the singer's voice without the music
  if (typeof vcApply === 'function') vcApply();             // voice chat (volume, mute and threshold live there)
  Object.entries(rtc.audio || {}).forEach(([id, a]) => { a.muted = hold || isMutedId(id); });
  const rv = $('#rv'); if (rv) rv.muted = Object.entries(rtc.rems || {}).some(([id, s]) => s === rv.srcObject && isMutedId(id));
}

