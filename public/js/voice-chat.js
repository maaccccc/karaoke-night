// ---- voice chat (rooms only, optional): talk with the room, even during songs.
// Everyone who presses "Join voice chat" is connected directly to everyone else in it (browser to browser).
// While a song is playing, other people's voices are lowered (default 30%) so the singer stays clear but you still hear the reactions.
const vc = { on: false, muted: false, stream: null, pcs: {}, audio: {}, pend: {}, duck: 30, since: {}, tries: {}, q: {}, gaveUp: {}, seen: {} };
try { const d = parseInt(localStorage.getItem('vcDuck'), 10); if (d >= 0 && d <= 100) vc.duck = d; } catch (e) {}
const vcSinging = () => room.on && active && isSinger();                 // singers are already heard through the song stream
const vcVol = () => (room.on && active ? vc.duck : 100) / 100;           // lowered while a song is playing

function vcApply() {
  Object.values(vc.audio).forEach(a => { a.volume = vcVol(); });
  if (vc.stream) vc.stream.getAudioTracks().forEach(t => { t.enabled = !vc.muted && !vcSinging(); });
}
function vcRender() {
  const j = $('#vcJoin'); if (!j) return;
  j.textContent = vc.on ? '🎧 Leave voice chat' : '🎧 Join voice chat'; j.classList.toggle('on', vc.on);
  $('#vcMute').style.display = vc.on ? '' : 'none'; $('#vcMute').textContent = vc.muted ? '🔇 Unmute' : '🎙 Mute';
  $('#vcDuckRow').style.display = vc.on ? '' : 'none'; $('#vcDuck').value = vc.duck; $('#vcDuckV').textContent = vc.duck + '%';
  $('#vcNote').textContent = vc.on ? (vcSinging() ? 'You are singing, so your voice chat mic is paused for now.' : vc.muted ? 'You are muted.' : 'You are in voice chat. Everyone in it can hear you.')
    : 'Talk with everyone in the room, even during songs (at a lower volume so the singer stays clear). Headphones avoid echo.';
}
function vcStatus(id) {   // how is my link to this person?  'ok' | 'wait' | 'fail'
  if (vc.gaveUp[id]) return 'fail';
  const pc = vc.pcs[id]; return pc && pc.connectionState === 'connected' ? 'ok' : 'wait';
}
function vcPeersRender() {
  const box = $('#vcPeers'); if (!box) return; box.textContent = '';
  if (!vc.on || !room.on) return;
  room.peers.filter(p => p.vc && p.id !== room.id && !p.away).forEach(p => {
    const s = vcStatus(p.id), row = el('div', null, 'vcp ' + s);
    row.append(el('span', s === 'ok' ? '✓' : s === 'fail' ? '⚠' : '…', 'vci'), el('span', p.name + (p.vcm ? ' (muted)' : '') + ' · ' + (s === 'ok' ? 'connected' : s === 'fail' ? 'cannot connect' : 'connecting…')));
    box.appendChild(row);
  });
  if (Object.values(vc.gaveUp).some(Boolean)) box.appendChild(el('p', ICE.turn ? 'Some links could not be made even through the relay. Ask that person to try another network.' : 'A strict network (some mobile data, school or office Wi-Fi) is blocking direct voice between two people. Fix: run the server with a TURN relay (see the README, “Voice chat across strict networks”).', 'note'));
}
function vcWatch() {   // a link that never connects is retried (the caller makes a fresh offer); after 3 tries we report it
  const now = Date.now();
  const want = room.peers.filter(p => p.vc && p.id !== room.id && !p.away).map(p => p.id);   // the person being called also gives up if nobody ever reaches them
  want.forEach(id => { const pc = vc.pcs[id]; if (pc && pc.connectionState === 'connected') { delete vc.seen[id]; return; } vc.seen[id] = vc.seen[id] || now; if (now - vc.seen[id] > 40000) vc.gaveUp[id] = true; });
  Object.keys(vc.seen).forEach(id => { if (!want.includes(id)) delete vc.seen[id]; });
  Object.entries(vc.pcs).forEach(([id, pc]) => {
    if (pc.connectionState === 'connected') { vc.tries[id] = 0; delete vc.gaveUp[id]; return; }
    if (now - (vc.since[id] || now) > 12000) {
      const n = (vc.tries[id] = (vc.tries[id] || 0) + 1); vcDrop(id);
      if (n >= 3) vc.gaveUp[id] = true; else if (room.id < id) vcCall(id);
    }
  });
}
function vcAnnounce() {   // the server forgot we are in voice chat (it restarted, or we reconnected): tell it again
  const me = room.peers.find(p => p.id === room.id);
  if (vc.on && me && !me.vc) roomOp({ op: 'vc', on: true, muted: vc.muted });
}
setInterval(() => { if (vc.on) { vcApply(); vcRender(); vcWatch(); vcPeersRender(); } }, 500);
document.addEventListener('click', () => Object.values(vc.audio).forEach(a => { if (a.paused) a.play().catch(() => {}); }));   // browsers may block audio until you click

function vcDrop(id) {
  const pc = vc.pcs[id]; delete vc.pcs[id]; delete vc.pend[id]; delete vc.since[id];
  if (pc) { try { pc.close(); } catch (e) {} }
  const a = vc.audio[id]; if (a) { a.srcObject = null; delete vc.audio[id]; }
}
function vcPc(peer) {
  const pc = new RTCPeerConnection(ICE); vc.pcs[peer] = pc; vc.since[peer] = Date.now();
  vc.stream.getAudioTracks().forEach(t => pc.addTrack(t, vc.stream));
  pc.onicecandidate = e => { if (e.candidate) roomRtc(peer, { vc: 1, kind: 'ice', cand: e.candidate }); };
  pc.ontrack = e => { const a = vc.audio[peer] || (vc.audio[peer] = new Audio()); a.srcObject = e.streams[0]; a.volume = vcVol(); a.play().catch(() => {}); };
  pc.onconnectionstatechange = () => {
    if (vc.pcs[peer] !== pc) return; vc.since[peer] = Date.now();
    if (pc.connectionState === 'connected') { vc.tries[peer] = 0; delete vc.gaveUp[peer]; }
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { vcDrop(peer); vc.tries[peer] = (vc.tries[peer] || 0) + 1; if (vc.tries[peer] >= 3) vc.gaveUp[peer] = true; else setTimeout(vcSync, 1500); }
  };
  return pc;
}
async function vcCall(peer) {
  const pc = vcPc(peer);
  try { const off = await pc.createOffer(); await pc.setLocalDescription(off); roomRtc(peer, { vc: 1, kind: 'offer', sdp: pc.localDescription }); } catch (e) {}
}
// Keep one connection per person in voice chat. The person with the lower id makes the call, the other answers.
function vcSync() {
  vcRender(); if (!vc.on || !room.on) return; vcAnnounce();
  const want = new Set(room.peers.filter(p => p.vc && p.id !== room.id && !p.away).map(p => p.id));
  Object.keys(vc.pcs).forEach(id => { if (!want.has(id)) vcDrop(id); });
  want.forEach(id => { if (!vc.pcs[id] && !vc.gaveUp[id] && room.id < id) vcCall(id); });
}
function onVc(from, d) { return vc.q[from] = (vc.q[from] || Promise.resolve()).then(() => onVc1(from, d)).catch(() => {}); }   // one message at a time per person: an answer and its candidates arrive together
async function onVc1(from, d) {
  try {
    if (!vc.on) return;
    if (d.kind === 'offer') {
      if (vc.pcs[from]) vcDrop(from);
      const pc = vcPc(from); await pc.setRemoteDescription(d.sdp);
      (vc.pend[from] || []).forEach(c => pc.addIceCandidate(c).catch(() => {})); vc.pend[from] = [];
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); roomRtc(from, { vc: 1, kind: 'answer', sdp: pc.localDescription });
    } else if (d.kind === 'answer') {
      const pc = vc.pcs[from];
      if (pc && pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(d.sdp); (vc.pend[from] || []).forEach(c => pc.addIceCandidate(c).catch(() => {})); vc.pend[from] = []; }
    } else if (d.kind === 'ice') {
      const pc = vc.pcs[from];
      if (pc && pc.remoteDescription) await pc.addIceCandidate(d.cand); else (vc.pend[from] = vc.pend[from] || []).push(d.cand);
    }
  } catch (e) {}
}
async function vcJoin() {
  if (!room.on || vc.on) return;
  const mid = ($('#micSel') || {}).value;
  try { vc.stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }, mid ? { deviceId: { exact: mid } } : {}) }); }
  catch (e) { say('Voice chat needs your microphone' + (e.name === 'NotAllowedError' ? ': allow it with the lock icon in the address bar.' : ' (' + (e.name || e.message) + ').')); return; }
  vc.on = true; vc.muted = false; vc.tries = {}; vc.gaveUp = {}; vc.seen = {}; roomOp({ op: 'vc', on: true, muted: false }); vcApply(); vcSync();
}
function vcLeave() {
  Object.keys(vc.pcs).forEach(vcDrop);
  if (vc.stream) { vc.stream.getTracks().forEach(t => t.stop()); vc.stream = null; }
  vc.on = false; vc.muted = false; vc.q = {}; if (room.on) roomOp({ op: 'vc', on: false, muted: false }); vcRender(); vcPeersRender();
}
$('#vcJoin').onclick = () => { if (vc.on) vcLeave(); else vcJoin(); };
$('#vcMute').onclick = () => { vc.muted = !vc.muted; roomOp({ op: 'vc', on: true, muted: vc.muted }); vcApply(); vcRender(); };
$('#vcDuck').oninput = e => { vc.duck = +e.target.value; try { localStorage.setItem('vcDuck', vc.duck); } catch (x) {} vcApply(); vcRender(); };
vcRender();
