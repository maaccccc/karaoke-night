// ---- mode picker: the owner of the next song chooses Solo / Duet / Tournament + partner BEFORE the ready check
let pkIn = null, pkTimer = 0, pkSel = { mode: 'solo', ops: [] };
const modeDesc = { solo: 'Just you on the mic.', duet: 'You and a partner share the song. The lines are shuffled at random, with a few sung together, and your mic is only live on your lines. Each gets their own score.', tournament: 'Choose who you want to fight, one person or several. The lines are shuffled at random and your mic is only live on your lines. The highest score wins a 10-point bonus.' };
function renderPick() {
  const mb = $('#pkModes'); mb.textContent = '';
  const others = room.peers.filter(p => p.id !== room.id && !p.away);
  Object.keys(modeName).forEach(k => {
    const b = el('button', modeName[k], 'ghost' + (pkSel.mode === k ? ' on' : '')); b.type = 'button';
    b.disabled = k !== 'solo' && !others.length;
    b.onclick = () => { pkSel.mode = k; if (k === 'solo') pkSel.ops = []; else if (k === 'duet') pkSel.ops = pkSel.ops.slice(0, 1); renderPick(); };
    mb.appendChild(b);
  });
  $('#pkDesc').textContent = others.length || pkSel.mode === 'solo' ? modeDesc[pkSel.mode] : 'Duet and Tournament need another person in the lobby.';
  const two = pkSel.mode !== 'solo', multi = pkSel.mode === 'tournament'; $('#pkPartnerBox').style.display = two ? 'block' : 'none';
  pkSel.ops = pkSel.ops.filter(n => others.some(p => p.name === n));
  $('#pkWho').textContent = multi ? 'Choose who you want to fight (tap one or more):' : 'Choose your partner from the lobby:';
  const pl = $('#pkPartners'); pl.textContent = '';
  if (multi && others.length > 1) {
    const all = pkSel.ops.length === others.length, b = el('button', all ? 'Clear all' : '⚔️ Fight everyone', 'ghost'); b.type = 'button';
    b.onclick = () => { pkSel.ops = all ? [] : others.map(p => p.name); renderPick(); }; pl.appendChild(b);
  }
  if (two) others.forEach(p => {
    const on = pkSel.ops.includes(p.name), b = el('button', '', 'ghost' + (on ? ' on' : '')); b.type = 'button';
    const av = el('span', (p.av || {}).e || '🎤', 'av'); av.style.background = (p.av || {}).c || '#888';
    b.append(av, el('span', (on && multi ? '✓ ' : '') + p.name));
    b.onclick = () => { pkSel.ops = multi ? (on ? pkSel.ops.filter(n => n !== p.name) : pkSel.ops.concat(p.name)) : [p.name]; renderPick(); }; pl.appendChild(b);
  });
  $('#pkGo').disabled = two && !pkSel.ops.length;
}
function showPick(m) {
  pkIn = m; clearInterval(pkTimer);
  if (m.item.singer !== room.name) { say(m.item.singer + ' is choosing how to sing “' + m.item.song.title + '”…'); return; }
  pkSel = { mode: 'solo', ops: [] }; $('#pkSong').textContent = m.item.song.title + ' · ' + m.item.song.artist;
  renderPick(); $('#pickdlg').classList.add('show'); say('Your song is next. Choose how you want to sing it.');
  pkTimer = setInterval(() => {
    const s = Math.ceil((m.until - (Date.now() + room.skew)) / 1000);
    $('#pkLeft').textContent = s > 0 ? 'Choose within ' + s + 's.' : '';
    if (s <= 0) { hidePick(); say('No mode was chosen, so the start was cancelled.'); }
  }, 250);
}
function hidePick() { clearInterval(pkTimer); pkIn = null; $('#pickdlg').classList.remove('show'); }
$('#pkGo').onclick = () => { if (!pkIn) return; roomOp({ op: 'mode', mode: pkSel.mode, singer2: pkSel.ops[0] || '', singers: pkSel.ops }); };
$('#pkNo').onclick = () => { hidePick(); roomOp({ op: 'unpick' }); };

let rdIn = null, rdTimer = 0;
function renderReady() {
  const m = rdIn; if (!m) return; const me = m.yes.includes(room.name);
  $('#rdSong').textContent = m.item.song.title + ' · ' + whoTxt(m.item) + (m.item.singer2 ? ' sing (' + modeName[m.item.mode] + ')' : ' sings');
  $('#rdBy').textContent = m.by + ' wants to start the next song.';
  $('#rdWho').textContent = 'Ready: ' + m.yes.join(', ');
  $('#rdYes').disabled = me; $('#rdYes').textContent = me ? 'Waiting for the others…' : 'I’m ready!';
}
function showReady(m) {
  rdIn = m; renderReady(); $('#rdy').classList.add('show'); clearInterval(rdTimer);
  rdTimer = setInterval(() => {
    const s = Math.ceil((m.until - (Date.now() + room.skew)) / 1000);
    $('#rdLeft').textContent = s > 0 ? 'Cancels in ' + s + 's if someone is not ready.' : '';
    if (s <= 0) { hideReady(); say('Not everyone was ready, so the song did not start.'); }
  }, 250);
  if (inItem(m.item)) say('You are up next! Put your headphones on.');
}
function hideReady() { clearInterval(rdTimer); rdIn = null; $('#rdy').classList.remove('show'); }
$('#rdYes').onclick = () => { if (rdIn) { rdIn.yes = rdIn.yes.concat(room.name); renderReady(); } roomOp({ op: 'ready' }); };
$('#rdNo').onclick = () => { hideReady(); roomOp({ op: 'unready' }); };
function runCountdown(m) {
  const cd = $('#cd'), num = $('#cdNum');
  $('#cdWho').textContent = (inItem(m.item) ? 'You’re up! ' : whoTxt(m.item) + (m.item.singer2 ? ' are up: ' : ' is up: ')) + m.item.song.title;
  cd.classList.add('show');
  const t = setInterval(() => {
    const ms = m.at - (Date.now() + room.skew);
    if (ms <= 0) { clearInterval(t); num.textContent = '🎤'; setTimeout(() => cd.classList.remove('show'), 700); }
    else num.textContent = Math.ceil(ms / 1000);
  }, 100);
}
function onStart(m) {
  room.live = null; room.watch = false; refreshLive();
  nextStop(); nextInfo = null; hideReady(); aud = { avg: 0, n: 0, mine: 0 };
  if (active) leaveSong();
  room.prep = !!m.prep; room.startAt = m.prep ? 0 : m.at; loadedSent = false; prebuf = false; holding = false;
  if (m.prep) { $('#cdWho').textContent = 'Getting the song ready for everyone…'; $('#cdNum').textContent = '…'; $('#cd').classList.add('show'); }
  else runCountdown(m);
  current = { song: m.item.song, singer: m.item.singer, singer2: m.item.singer2 || '', singers: m.item.singers || [], mode: m.item.mode || 'solo', sids: m.sids, seed: m.seed || 1, theme: m.item.theme || 'neon', file: null };
  pendingResult = null; awaiting = false; say('Loading lyrics…'); loadAndRun();
}
function onGo(m) {          // everybody has loaded: count down together, then start on the shared clock
  if (room.live && !room.watch) { room.live.at = m.at; room.live.prep = false; return; }   // joined mid-song, not watching (yet)
  if (!current) return;
  room.prep = false; room.startAt = m.at; say('');
  runCountdown({ at: m.at, item: { singer: current.singer, singer2: current.singer2, singers: current.singers, song: current.song } });
  if (active && player) startSync();
  setTimeout(() => {
    const st = player && player.getPlayerState ? player.getPlayerState() : -1;
    if (active && st !== 1 && st !== 3) $('#micNote').textContent = 'The video isn’t playing. Use Chrome, Edge, or Brave, or tap Finish early to skip.';
  }, GO_WAIT + 8000);
}
const GO_WAIT = 4000;
function resultNote(m) { return (m.results || []).map(r => r.name + ' ' + r.pts).join(' · ') + (m.winner ? ' · ' + m.winner + ' wins the tournament (+10 bonus)!' : m.mode === 'tournament' ? ' · it’s a tie!' : ''); }
function onResult(m) {
  setAwData(m);        // everyone gets the same numbers, so everyone sees the same awards
  if (m.results) {
    if (m.mode === 'tournament') showPodium(m);
    if (!current) return;
    if (active) { pendingResult = m; finish(); } else if (awaiting) onResultShow(m); else { $('#scoreNote').textContent = resultNote(m); say(resultNote(m)); if ($('#rate').style.display === 'block') renderAwards(); }
    return;
  }
  if (!current || m.name === room.name) return;
  if (active) { pendingResult = m; finish(); } else if (awaiting) onResultShow(m);
}
function onResultShow(m) {
  awaiting = false; showResult(m.pts, m.parts, m.hasMic);
  $('#scoreNote').textContent = m.results ? resultNote(m) : m.name + ' scored ' + m.pts + '.';
}
function leaveSong() {   // stop watching a song locally (listeners only)
  active = false; cancelAnimationFrame(raf); stopMedia(); closeRtc(); awaiting = false; room.prep = false; room.watch = false;
  $('#ytcard').classList.remove('show'); drawMeter(0, 0); refreshTheme();
  if (actx) { try { actx.close(); } catch (e) {} actx = null; } an = null;
  document.body.classList.remove('aud', 'instage'); $('#stage').style.display = 'none'; $('#home').style.display = 'block'; renderNow(); refreshLive();
}
// clearer voice: full-band mono Opus, no silence suppression, error correction, higher bitrate
function tuneOpus(sdp) {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i); if (!m) return sdp;
  const low = prefs.lowLat !== false;      // low-latency voice: 10 ms packets instead of 20 ms (about 10 ms sooner); applies to the next connection
  const want = { stereo: 0, 'sprop-stereo': 0, useinbandfec: 1, usedtx: 0, cbr: 1, maxaveragebitrate: 96000, maxplaybackrate: 48000 };
  if (low) want.minptime = 10;
  let out = sdp.replace(new RegExp('a=fmtp:' + m[1] + ' ([^\\r\\n]*)'), (all, params) => {
    const o = {}; params.split(';').forEach(kv => { const [k, v] = kv.trim().split('='); if (k) o[k] = v; });
    Object.assign(o, want);
    return 'a=fmtp:' + m[1] + ' ' + Object.entries(o).map(([k, v]) => k + '=' + v).join(';');
  });
  if (low && !/a=ptime:/i.test(out)) out = out.replace(new RegExp('(a=rtpmap:' + m[1] + ' opus/48000[^\\r\\n]*\\r?\\n)', 'i'), '$1a=ptime:10\r\n');
  return out;
}
// singer -> listeners: one WebRTC connection per listener
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
fetch('/api/ice').then(r => r.json()).then(d => { if (d.iceServers && d.iceServers.length) ICE.iceServers = d.iceServers; ICE.turn = !!d.turn; }).catch(() => {});   // adds the TURN relay if the server has one
function newPc(peer) {
  const pc = new RTCPeerConnection(ICE); rtc.pcs[peer] = pc;
  pc.onicecandidate = e => { if (e.candidate) roomRtc(peer, { kind: 'ice', cand: e.candidate }); };
  pc.ontrack = e => { setJb(pc, jbc().start); rtc.remote = e.streams[0]; rtc.rems[peer] = rtc.remote; const a = rtc.audio[peer] || (rtc.audio[peer] = new Audio()); a.srcObject = rtc.remote; a.volume = $('#rvol').value / 100; if (room.live && !room.watch) a.muted = true; a.play().catch(() => {}); if (active) hookRemote(); };   // both sides play what the other sends
  return pc;
}
async function connectPeers() {
  for (const p of room.peers) {
    if (p.id === room.id || rtc.pcs[p.id] || !rtc.stream) continue;
    const partner = current && current.sids && current.sids.includes(p.id);
    if (partner && p.id < room.id) continue;          // the partner with the lower id makes the call, we answer with our voice
    if (partner) { if (rtc.dly[p.id]) continue; rtc.dly[p.id] = 1; await new Promise(r => setTimeout(r, 1200)); if (!rtc.stream || rtc.pcs[p.id]) continue; }
    const pc = newPc(p.id); rtc.stream.getAudioTracks().forEach(t => { try { t.contentHint = 'music'; } catch (e) {} pc.addTrack(t, rtc.stream); });
    try {
      const off = await pc.createOffer(); off.sdp = tuneOpus(off.sdp); await pc.setLocalDescription(off);
      roomRtc(p.id, { kind: 'offer', sdp: pc.localDescription });
      const sn = pc.getSenders().find(x => x.track), pr = sn.getParameters(); pr.encodings = pr.encodings && pr.encodings.length ? pr.encodings : [{}]; pr.encodings[0].maxBitrate = 96000; await sn.setParameters(pr);
    } catch (e) {}
  }
}
const rtcQ = {};   // handle each person's signalling messages strictly one after another (an answer and its candidates arrive together)
function onRtc(from, d) { return rtcQ[from] = (rtcQ[from] || Promise.resolve()).then(() => onRtc1(from, d)).catch(() => {}); }
async function onRtc1(from, d) {
  try {
    if (d.kind === 'offer') {
      if (rtc.pcs[from]) { try { rtc.pcs[from].close(); } catch (e) {} }
      const pc = newPc(from);
      await pc.setRemoteDescription(d.sdp);
      (rtc.pend[from] || []).forEach(c => pc.addIceCandidate(c).catch(() => {})); rtc.pend[from] = [];
      if (isSinger() && !rtc.stream) { for (let i = 0; i < 40 && !rtc.stream; i++) await new Promise(r => setTimeout(r, 100)); }   // our mic may still be starting
      if (rtc.stream && isSinger()) rtc.stream.getAudioTracks().forEach(t => { try { pc.addTrack(t, rtc.stream); } catch (e) {} });   // duet partner: send ours back on the same link
      const ans = await pc.createAnswer(); ans.sdp = tuneOpus(ans.sdp); await pc.setLocalDescription(ans); roomRtc(from, { kind: 'answer', sdp: pc.localDescription });
    } else if (d.kind === 'answer') {
      const pc = rtc.pcs[from]; if (pc) { await pc.setRemoteDescription(d.sdp); (rtc.pend[from] || []).forEach(c => pc.addIceCandidate(c).catch(() => {})); rtc.pend[from] = []; }
    } else if (d.kind === 'ice') {
      const pc = rtc.pcs[from];
      if (pc && pc.remoteDescription) await pc.addIceCandidate(d.cand); else (rtc.pend[from] = rtc.pend[from] || []).push(d.cand);
    }
  } catch (e) {}
}
function hookRemote() {   // drive the volume meter from the singer's voice
  if (!rtc.remote || !room.on || isSinger()) return;
  try {
    if (!actx || actx.state === 'closed') actx = new (window.AudioContext || window.webkitAudioContext)();
    actx.resume().catch(() => {});
    if (!an) { an = actx.createAnalyser(); an.fftSize = 2048; rtc.hooked.clear(); }
    Object.entries(rtc.rems).forEach(([k, st]) => { if (!rtc.hooked.has(k)) { rtc.hooked.add(k); actx.createMediaStreamSource(st).connect(an); } });
  } catch (e) {}
}
function closeRtc() {
  Object.values(rtc.pcs).forEach(pc => { try { pc.close(); } catch (e) {} }); rtc.pcs = {}; rtc.pend = {}; rtc.stream = null; rtc.remote = null; Object.values(rtc.audio).forEach(a => { a.srcObject = null; }); rtc.rems = {}; rtc.audio = {}; rtc.hooked = new Set(); rtc.dly = {}; rtc.jb = {}; gate = null; gateState = -1; rtc.lat = {}; listenDelay = 0; clearInterval(latIv);
  const a = $('#rv'); a.srcObject = null;
}
$('#rvol').oninput = e => { $('#rv').volume = e.target.value / 100; Object.values(rtc.audio).forEach(a => { a.volume = e.target.value / 100; }); };
buildPickers();
$('#qrClose').onclick = () => $('#qrdlg').close();
$('#roomBtn').onclick = async () => {
  const link = location.origin + '/?room=' + room.code;
  try { await navigator.clipboard.writeText(link); say('Invite link copied: ' + link); } catch (e) {}
  $('#qrLink').textContent = link; $('#qrBox').textContent = '';
  const local = /^(localhost|127\.|\[?::1)/.test(location.hostname);
  $('#qrNote').textContent = local ? 'This address only works on this computer. Open the https link from your tunnel (see the README), then press Room again.' : 'Scan with a phone camera to join room ' + room.code + '. The link is also copied.';
  $('#qrdlg').showModal();
  try {
    if (!window.qrcode) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    const qr = window.qrcode(0, 'M'); qr.addData(link); qr.make(); $('#qrBox').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch (e) { $('#qrBox').textContent = 'Could not load the QR code (needs internet). Use the link below.'; }
};
addEventListener('pagehide', e => {
  if (!room.on) return;
  try { const l = JSON.parse(localStorage.getItem('karaokeLast') || 'null'); if (l) { l.t = Date.now(); localStorage.setItem('karaokeLast', JSON.stringify(l)); } } catch (x) {}
  if (!e.persisted) navigator.sendBeacon('/api/room/leave', JSON.stringify({ room: room.code, id: room.id, tab: TAB }));
});
{
  const qs = new URLSearchParams(location.search); let nm = '';
  try { nm = localStorage.getItem('karaokeName') || ''; } catch (e) {}
  $('#rName').value = nm; $('#rCode').value = (qs.get('room') || '').toUpperCase();
  const enter = created => {
    document.body.classList.remove('home'); window.scrollTo(0, 0);
    if (created) { $('#qrdlg').addEventListener('close', () => { if (!seen) openMicTest(); }, { once: true }); $('#roomBtn').click(); }
    else if (!seen) openMicTest();
  };
  const go = async create => {
    const name = $('#rName').value.trim(); if (!name) { $('#rStat').textContent = 'Enter your name first.'; $('#rName').focus(); return; }
    let code = $('#rCode').value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (create) code = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[b % 24]).join('');
    else if (!code) { $('#rStat').textContent = 'Type the room code your friend gave you, or press Create a room.'; $('#rCode').focus(); return; }
    $('#rStat').textContent = 'Joining…';
    try { try { localStorage.setItem('karaokeName', name); } catch (e) {} await roomJoin(code, name, create ? roomVis : undefined); $('#rStat').textContent = ''; enter(create); }
    catch (e) { $('#rStat').textContent = 'Could not join: ' + e.message; }
  };
  try {
    // Refreshed page: back into the same room. Works for people who came in through an invite link (?room=CODE stays in the address bar)
    // and on phones that wipe the tab's session storage on a refresh / tab restore (the room is also remembered in localStorage).
    const inv = (qs.get('room') || '').toUpperCase(); let sr = ''; try { sr = sessionStorage.getItem('karaokeRoom') || ''; } catch (e) {}
    const nav = ((performance.getEntriesByType && performance.getEntriesByType('navigation')) || [])[0], navType = nav ? nav.type : '';
    if (!sr && (navType === 'reload' || navType === 'back_forward')) {
      try {
        const l = JSON.parse(localStorage.getItem('karaokeLast') || 'null');
        if (l && l.code && Date.now() - l.t < 12 * 3600 * 1000 && (!inv || inv === l.code)) {
          sr = l.code; sessionStorage.setItem('karaokeRoom', l.code);
          // (the room id comes from the device and the room key from localStorage, so nothing else needs restoring)
        }
      } catch (e) {}
    }
    if (sr && nm && (!inv || inv === sr)) { $('#rCode').value = sr; setTimeout(() => go(false), 0); }
    else if (inv) $('#rStat').textContent = 'You were invited to room ' + $('#rCode').value + '. Enter your name and press Join a room.';
  } catch (e) {}
  $('#lJoin').onclick = () => go(false); $('#lCreate').onclick = () => go(true);
  $('#lSolo').onclick = () => { $('#rStat').textContent = ''; enter(false); };
  $('#lMicBtn').onclick = () => openMicTest();
  $('#homeBtn').onclick = () => {
    const d = $('#homedlg');
    $('#hmTitle').textContent = room.on ? 'Leave the room?' : 'Go back home?';
    $('#hmText').textContent = room.on ? 'You will leave the room and go back to the home page.' : 'Your queue on this device will be cleared.';
    $('#hmStay').onclick = () => d.close();
    $('#hmLeave').onclick = () => {
      d.close();
      try { if (room.on) navigator.sendBeacon('/api/room/leave', JSON.stringify({ room: room.code, id: room.id, tab: TAB })); sessionStorage.removeItem('karaokeRoom'); localStorage.removeItem('karaokeLast'); } catch (e) {}
      location.href = location.pathname;
    };
    d.showModal(); $('#hmStay').focus();
  };
  $('#rName').onkeydown = e => { if (e.key === 'Enter') go(!$('#rCode').value.trim()); };
  $('#rCode').onkeydown = e => { if (e.key === 'Enter') go(false); };
}
$('#micSel').addEventListener('change', () => { $('#tSel').value = $('#micSel').value; });
$('#mtest').addEventListener('close', () => { tStop(); try { localStorage.setItem('micChecked', '1'); } catch (e) {} $('#lMic').textContent = '✓ Microphone checked on this device. You can test again any time.'; });
$('#testBtn').onclick = openMicTest;
let seen = false; try { seen = localStorage.getItem('micChecked') === '1'; } catch (e) {}
applyPrefs(false); renderSide();

