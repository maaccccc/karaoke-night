// ---- voice chat (rooms only, optional): talk with the room, even during songs.
// Everyone who presses "Join voice chat" is connected directly to everyone else in it (browser to browser).
// While a song is playing, other people's voices are lowered (default 30%) so the singer stays clear but you still hear the reactions.
const vc = { on: false, muted: false, stream: null, pcs: {}, audio: {}, pend: {}, duck: 30, since: {}, tries: {}, q: {}, gaveUp: {}, seen: {}, ctx: null, lim: null, nodes: {}, ui: {}, ups: {}, note: null };
try { const d = parseInt(localStorage.getItem('vcDuck'), 10); if (d >= 0 && d <= 100) vc.duck = d; } catch (e) {}
const vcSinging = () => room.on && active && isSinger();                 // singers are already heard through the song stream
const vcVol = () => (room.on && active ? vc.duck : 100) / 100;           // lowered while a song is playing

// ---- volume: each person's own volume (right-click or press-and-hold a person: 0-100%) and the master "Voice chat volume" (0-200%, 100% = normal)
// Settings are remembered in this browser (people by name). Sound goes through the Web Audio API so the master can go above 100%.
try { vc.ups = JSON.parse(localStorage.getItem('vcUser') || '{}') || {}; } catch (e) { vc.ups = {}; }
vc.master = 100; try { const m = parseInt(localStorage.getItem('vcMaster'), 10); if (m >= 0 && m <= 200) vc.master = m; } catch (e) {}
const vcName = id => { const p = (room.peers || []).find(x => x.id === id); return p ? p.name : id; };
const vcPref = id => { const u = vc.ups[vcName(id)] || {}; return { v: u.v >= 0 && u.v <= 100 ? u.v : 100 }; };
function vcSetVol(id, v) {
  const n = vcName(id); if (v >= 100) delete vc.ups[n]; else vc.ups[n] = { v };
  try { localStorage.setItem('vcUser', JSON.stringify(vc.ups)); } catch (e) {}
  vcApply();
}
function vcCtx() {
  if (vc.ctx && vc.ctx.state !== 'closed') return vc.ctx;
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    vc.ctx = new C(); vc.lim = vc.ctx.createDynamicsCompressor();   // limiter so voices boosted above 100% do not crackle
    vc.lim.threshold.value = -3; vc.lim.knee.value = 0; vc.lim.ratio.value = 20; vc.lim.attack.value = 0.003; vc.lim.release.value = 0.1;
    vc.lim.connect(vc.ctx.destination);
  } catch (e) { vc.ctx = null; vc.lim = null; }
  return vc.ctx;
}
function vcUnhook(id) {
  const n = vc.nodes[id]; if (!n) return; delete vc.nodes[id];
  [n.src, n.an, n.vol].forEach(x => { try { x.disconnect(); } catch (e) {} });
}
function vcHook(id, ms) {   // incoming voice -> level meter, volume -> limiter -> speakers
  vcUnhook(id); const ctx = vcCtx(); if (!ctx || !vc.lim) return;
  try {
    const src = ctx.createMediaStreamSource(ms), an = ctx.createAnalyser(), vol = ctx.createGain();
    an.fftSize = 1024; src.connect(an); src.connect(vol); vol.connect(vc.lim);
    vc.nodes[id] = { src, an, vol, buf: new Float32Array(an.fftSize) };
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (e) { delete vc.nodes[id]; }
}
function vcTick() {   // about 20 times a second: move each person's meter
  Object.entries(vc.nodes).forEach(([id, n]) => {
    n.an.getFloatTimeDomainData(n.buf); let sum = 0; for (let i = 0; i < n.buf.length; i++) sum += n.buf[i] * n.buf[i];
    const rms = Math.sqrt(sum / n.buf.length), db = rms > 0 ? 20 * Math.log10(rms) : -100, lvl = Math.max(0, Math.min(100, (db + 60) / 60 * 100));   // 0-100 = -60 dB .. 0 dB
    const u = vc.ui[id]; if (u) { u.fill.style.width = lvl + '%'; u.fill.classList.toggle('hot', lvl > 90); }
  });
}
setInterval(() => { if (vc.on) vcTick(); }, 50);

// ---- click, hover or right-click a person (press and hold on a phone): their volume, Discord style
const vcm = { box: null, id: '', pin: false, at: 0 };
function vcMenuClose() { if (vcm.box) vcm.box.hidden = true; vcm.id = ''; vcm.pin = false; }
function vcMenuSync() {
  if (!vcm.box || !vcm.id) return; const n = vcName(vcm.id), v = vcPref(vcm.id).v;
  vcm.t.textContent = '🎧 ' + n; vcm.sl.value = v; vcm.val.textContent = v + '%'; vcm.mu.textContent = isMuted(n) ? '🔊 Unmute' : '🔇 Mute';
}
function vcMenuOpen(id, x, y, rect, pin) {   // rect = the person's row: the menu then sits beside it (left side first, the lobby is on the right)
  if (!room.on || id === room.id || !(room.peers || []).some(p => p.id === id)) return;
  if (!vcm.box) {
    const box = el('div', null, 'vcmenu'), t = el('b', '', 't'), lab = el('label', 'User volume '), val = el('b'), sl = el('input'), row = el('div', null, 'vcmr'), rs = el('button', '↺ Reset', 'ghost mini'), mu = el('button', '', 'ghost mini');
    sl.type = 'range'; sl.min = 0; sl.max = 100; sl.step = 1; rs.type = mu.type = 'button'; lab.appendChild(val); row.append(rs, mu); box.append(t, lab, sl, row); box.hidden = true; document.body.appendChild(box);
    sl.oninput = () => { vcSetVol(vcm.id, +sl.value); vcMenuSync(); };
    sl.ondblclick = rs.onclick = () => { vcSetVol(vcm.id, 100); vcMenuSync(); };
    mu.onclick = () => { toggleMute(vcName(vcm.id)); vcMenuSync(); };
    Object.assign(vcm, { box, t, sl, val, mu });
  }
  vcm.id = id; vcm.pin = !!pin; vcm.at = Date.now(); vcMenuSync(); vcm.box.hidden = false;
  const w = vcm.box.offsetWidth, h = vcm.box.offsetHeight;
  if (rect) { x = rect.left - w - 4 >= 8 ? rect.left - w - 4 : rect.right + 4; y = rect.top; }
  vcm.box.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; vcm.box.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
}
const vcRowAt = e => { const r = e.target.closest && e.target.closest('#lobList [data-pid], #vcPeers [data-pid]'); return r && r.dataset.pid !== room.id ? r : null; };
document.addEventListener('contextmenu', e => { const r = vcRowAt(e); if (!r) return; e.preventDefault(); vcMenuOpen(r.dataset.pid, e.clientX, e.clientY, null, true); });
document.addEventListener('pointerdown', e => {   // click anywhere else closes it (but not a click on the same person's row: that pins it open)
  const r = vcRowAt(e);
  if (vcm.box && !vcm.box.hidden && !vcm.box.contains(e.target) && !(r && r.dataset.pid === vcm.id)) vcMenuClose();
}, true);
// click a person: pins their volume box open (click again to close). Hover a person for a moment: it shows by itself and goes away when the mouse leaves.
document.addEventListener('click', e => {
  if (e.target.closest && e.target.closest('button, input, select, a, label, .vcmenu')) return;   // the Mute / Make host / Kick / Ban buttons keep their own job
  const r = vcRowAt(e); if (!r) return;
  const id = r.dataset.pid;
  if (vcm.id === id && vcm.pin && Date.now() - vcm.at > 600) { vcMenuClose(); return; }
  if (vcm.id === id && vcm.pin) return;   // just opened by press-and-hold; the tap that follows must not close it
  vcMenuOpen(id, 0, 0, r.getBoundingClientRect(), true);
});
let vcHo = 0, vcHc = 0;
const vcZone = t => !!(t && t.closest && (t.closest('.vcmenu') || vcRowAt({ target: t })));
const vcCanHover = () => !matchMedia || matchMedia('(hover: hover)').matches;
document.addEventListener('mouseover', e => {
  if (!room.on || !vcCanHover()) return;
  const r = vcRowAt(e);
  if (vcZone(e.target)) clearTimeout(vcHc);
  if (r && !vcm.pin && vcm.id !== r.dataset.pid) {
    clearTimeout(vcHo);
    vcHo = setTimeout(() => { if (!vcm.pin && r.isConnected) vcMenuOpen(r.dataset.pid, 0, 0, r.getBoundingClientRect(), false); }, 280);
  }
});
document.addEventListener('mouseout', e => {
  clearTimeout(vcHo);
  if (vcm.pin || !vcm.id || vcZone(e.relatedTarget)) return;
  clearTimeout(vcHc); vcHc = setTimeout(() => { if (!vcm.pin) vcMenuClose(); }, 250);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') vcMenuClose(); });
window.addEventListener('resize', vcMenuClose); window.addEventListener('blur', vcMenuClose);
let vcLp = 0;   // press and hold (phones have no right-click)
document.addEventListener('touchstart', e => { const r = e.touches.length === 1 && vcRowAt(e); if (!r) return; const t = e.touches[0]; clearTimeout(vcLp); vcLp = setTimeout(() => vcMenuOpen(r.dataset.pid, t.clientX, t.clientY, null, true), 500); }, { passive: true });
['touchend', 'touchcancel', 'touchmove'].forEach(ev => document.addEventListener(ev, () => clearTimeout(vcLp), { passive: true }));

function vcApply() {
  Object.entries(vc.audio).forEach(([id, a]) => {
    const n = vc.nodes[id], mu = isMutedId(id), v = vcPref(id).v / 100 * vc.master / 100;
    if (n) { a.muted = true; a.volume = 1; try { n.vol.gain.setTargetAtTime(mu ? 0 : v * vcVol(), n.vol.context.currentTime, 0.03); } catch (e) {} }   // the element only keeps the stream alive; Web Audio plays it
    else { a.muted = mu; a.volume = Math.min(1, v * vcVol()); }   // no Web Audio: normal playback (cannot go above 100%)
  });
  const sm = vc.send || vc.stream; if (sm) sm.getAudioTracks().forEach(t => { t.enabled = !vc.muted && !vcSinging(); });
}
function vcRender() {
  const j = $('#vcJoin'); if (!j) return;
  j.textContent = vc.on ? '🎧 Leave voice chat' : '🎧 Join voice chat'; j.classList.toggle('on', vc.on);
  $('#vcMute').style.display = vc.on ? '' : 'none'; $('#vcMute').textContent = vc.muted ? '🔇 Unmute' : '🎙 Mute';
  $('#vcMasterRow').style.display = $('#vcHint').style.display = vc.on ? '' : 'none'; $('#vcMaster').value = vc.master; $('#vcMasterV').textContent = vc.master + '%'; $('#vcMaster').classList.toggle('boost', vc.master > 100);
  $('#vcDuckRow').style.display = vc.on ? '' : 'none'; $('#vcDuck').value = vc.duck; $('#vcDuckV').textContent = vc.duck + '%';
  $('#vcNote').textContent = vc.on ? (vcSinging() ? 'You are singing, so your voice chat mic is paused for now.' : vc.muted ? 'You are muted.' : 'You are in voice chat. Everyone in it can hear you.')
    : 'Talk with everyone in the room, even during songs (at a lower volume so the singer stays clear). Headphones avoid echo.';
}
function vcStatus(id) {   // how is my link to this person?  'ok' | 'wait' | 'fail'
  if (vc.gaveUp[id]) return 'fail';
  const pc = vc.pcs[id]; return pc && pc.connectionState === 'connected' ? 'ok' : 'wait';
}
function vcRow(p) {
  const row = el('div', null, 'vcp wait'), head = el('div', null, 'vch'), ic = el('span', '…', 'vci'), nm = el('span', '', 'vcn');
  row.dataset.pid = p.id; row.title = 'Click or hover to change ' + p.name + '’s volume'; head.append(ic, nm);
  const meter = el('div', null, 'vcmeter'), fill = el('i', null, 'vcf'); meter.appendChild(fill); row.append(head, meter);
  return { row, ic, nm, fill };
}
function vcPeersRender() {
  const box = $('#vcPeers'); if (!box) return;
  if (!vc.on || !room.on) { box.textContent = ''; vc.ui = {}; vc.note = null; return; }
  const list = room.peers.filter(p => p.vc && p.id !== room.id && !p.away);
  Object.keys(vc.ui).forEach(id => { if (!list.some(p => p.id === id)) { vc.ui[id].row.remove(); delete vc.ui[id]; } });   // rows stay in place between updates so a slider can be dragged
  list.forEach(p => {
    const s = vcStatus(p.id); let u = vc.ui[p.id]; if (!u) { u = vc.ui[p.id] = vcRow(p); box.appendChild(u.row); }
    u.row.className = 'vcp ' + s; u.ic.textContent = s === 'ok' ? '✓' : s === 'fail' ? '⚠' : '…';
    u.nm.textContent = p.name + (p.vcm ? ' (muted)' : '') + ' · ' + (s === 'ok' ? 'connected' : s === 'fail' ? 'cannot connect' : 'connecting…');
  });
  const bad = Object.values(vc.gaveUp).some(Boolean);
  if (bad && !vc.note) vc.note = el('p', '', 'note');
  if (vc.note) {
    if (!bad) { vc.note.remove(); vc.note = null; return; }
    vc.note.textContent = ICE.turn ? 'Some links could not be made even through the relay. Ask that person to try another network.' : 'A strict network (some mobile data, school or office Wi-Fi) is blocking direct voice between two people. Fix: run the server with a TURN relay (see the README, “Voice chat across strict networks”).';
    if (vc.note.parentNode !== box || box.lastChild !== vc.note) box.appendChild(vc.note);
  }
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
document.addEventListener('click', () => { Object.values(vc.audio).forEach(a => { if (a.paused) a.play().catch(() => {}); }); if (vc.ctx && vc.ctx.state === 'suspended') vc.ctx.resume().catch(() => {}); });   // browsers may block audio until you click

function vcDrop(id) {
  const pc = vc.pcs[id]; delete vc.pcs[id]; delete vc.pend[id]; delete vc.since[id];
  if (pc) { try { pc.close(); } catch (e) {} }
  vcUnhook(id); const a = vc.audio[id]; if (a) { a.srcObject = null; delete vc.audio[id]; }
}
function vcPc(peer) {
  const pc = new RTCPeerConnection(ICE); vc.pcs[peer] = pc; vc.since[peer] = Date.now();
  const sm = vc.send || vc.stream; sm.getAudioTracks().forEach(t => pc.addTrack(t, sm));   // what we send = the mic after Mic suppression
  pc.onicecandidate = e => { if (e.candidate) roomRtc(peer, { vc: 1, kind: 'ice', cand: e.candidate }); };
  pc.ontrack = e => { const a = vc.audio[peer] || (vc.audio[peer] = new Audio()); a.srcObject = e.streams[0]; vcHook(peer, e.streams[0]); vcApply(); a.play().catch(() => {}); };
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
async function vcBuildSend() {   // microphone -> Mic suppression -> the track that is sent to everyone (if Web Audio fails, the raw microphone is sent)
  vc.send = vc.sup = vc.src = vc.dest = null; const ctx = vcCtx(); if (!ctx || !vc.stream) return;
  try {
    const sup = await makeSuppressor(ctx, prefs.sup, prefs.thr), src = ctx.createMediaStreamSource(vc.stream), dest = ctx.createMediaStreamDestination();
    src.connect(sup.in); sup.out.connect(dest); vc.sup = sup; vc.src = src; vc.dest = dest; vc.send = dest.stream;
  } catch (e) { vc.send = vc.sup = vc.src = vc.dest = null; }
}
async function vcSetMic(nv) {   // a different microphone (or a change of browser noise suppression): swap it without reconnecting anyone
  const old = vc.stream; vc.stream = nv;
  if (vc.send && vc.sup && vc.ctx && vc.ctx.state !== 'closed') {
    const ns = vc.ctx.createMediaStreamSource(nv); ns.connect(vc.sup.in); try { vc.src.disconnect(); } catch (e) {} vc.src = ns;
  } else {
    const nt = nv.getAudioTracks()[0]; nt.enabled = !vc.muted && !vcSinging();
    await Promise.all(Object.values(vc.pcs).map(pc => Promise.all(pc.getSenders().filter(x => x.track && x.track.kind === 'audio').map(x => x.replaceTrack(nt).catch(() => {})))));
  }
  old.getTracks().forEach(t => t.stop());
}
async function vcJoin() {
  if (!room.on || vc.on) return;
  vcCtx();   // made from the button press so the browser allows sound
  const mid = ($('#micSel') || {}).value;
  try { vc.stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign(supCons(prefs.sup, 'vc'), mid ? { deviceId: { exact: mid } } : {}) }); }
  catch (e) { say('Voice chat needs your microphone' + (e.name === 'NotAllowedError' ? ': allow it with the lock icon in the address bar.' : ' (' + (e.name || e.message) + ').')); return; }
  await vcBuildSend();
  vc.on = true; vc.muted = false; vc.tries = {}; vc.gaveUp = {}; vc.seen = {}; roomOp({ op: 'vc', on: true, muted: false }); vcApply(); vcSync();
}
function vcLeave() {
  Object.keys(vc.pcs).forEach(vcDrop);
  if (vc.stream) { vc.stream.getTracks().forEach(t => t.stop()); vc.stream = null; }
  vc.send = vc.sup = vc.src = vc.dest = null;
  if (vc.ctx) { try { vc.ctx.close(); } catch (e) {} vc.ctx = null; vc.lim = null; }
  vc.on = false; vc.muted = false; vc.q = {}; if (room.on) roomOp({ op: 'vc', on: false, muted: false }); vcRender(); vcPeersRender();
}
$('#vcJoin').onclick = () => { if (vc.on) vcLeave(); else vcJoin(); };
$('#vcMute').onclick = () => { vc.muted = !vc.muted; roomOp({ op: 'vc', on: true, muted: vc.muted }); vcApply(); vcRender(); };
$('#vcMaster').oninput = e => { vc.master = +e.target.value; try { localStorage.setItem('vcMaster', vc.master); } catch (x) {} vcApply(); vcRender(); };
$('#vcMaster').ondblclick = () => { vc.master = 100; try { localStorage.setItem('vcMaster', 100); } catch (x) {} vcApply(); vcRender(); };
$('#vcDuck').oninput = e => { vc.duck = +e.target.value; try { localStorage.setItem('vcDuck', vc.duck); } catch (x) {} vcApply(); vcRender(); };
vcRender();
