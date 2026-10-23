// Shared clock: in a room the video position is where the room's clock says it should be.
let syncIv = 0, lastSeek = 0;
// Listeners: a singer's voice reaches you a little late (network + voice buffer), so your music is held back by that amount
// (plus the "Voice sync" setting). The lyrics follow the video, so voice, music and lyrics line up. Singers are never held back.
let holdApplied = 0, holdStarted = false;
const holdWant = () => (room.on && active && !isSinger()) ? Math.max(-0.5, Math.min(1.5, (listenDelay || 0) + (prefs.vsync || 0))) : 0;
function startSync() {
  clearInterval(syncIv); lastSeek = 0; holdStarted = false; holdApplied = holdWant();
  const run = () => {
    if (!active || !player || !player.getPlayerState || !room.startAt) return;
    const base = (Date.now() + room.skew - room.startAt) / 1000, st = player.getPlayerState(), dur = playDur() || 1e9, want = holdWant(), now = Date.now();
    if (!holdStarted) holdApplied = want;                                     // not playing yet: just start at the right moment, nothing to seek
    const exp = base - holdApplied;
    if (exp < -0.3 || st === 0 || exp > dur) return;                         // not time yet, or the song is over
    if (st !== 1 && st !== 3) { try { player.playVideo(); } catch (e) {} }   // (re)start, also after the tab was hidden
    if (st === 1 && exp > 0) holdStarted = true;
    if (st === 1 && holdStarted && base - want > 0.5 && Math.abs(want - holdApplied) > 0.12 && now - lastSeek > 1500) {   // the voice delay or the Voice sync slider changed: re-align now
      holdApplied = want; lastSeek = now; try { player.seekTo(base - holdApplied + 0.3, true); } catch (e) {} return;
    }
    if (st === 1 && exp > 0.5 && Math.abs(player.getCurrentTime() - exp) > (prefs.lowLat !== false ? 0.35 : 0.7) && now - lastSeek > 4000) {
      lastSeek = now; try { player.seekTo(exp + 0.3, true); } catch (e) {}   // +0.3s: the seek takes a moment to resume
    }
  };
  syncIv = setInterval(() => { if (!active) clearInterval(syncIv); else run(); }, 200);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
}
async function syncClock() {
  if (active) return; let best = null;
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    try { const d = await (await fetch('/api/room/time')).json(), t1 = Date.now(); if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, skew: d.now - (t0 + t1) / 2 }; } catch (e) {}
  }
  if (best && !active) room.skew = best.skew;
}
setInterval(() => { if (room.on) syncClock(); }, 60000);

// ---- random line turns (duet + tournament), mic gate, and voice/music sync
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeTurns(seed, n, mode, k) {        // 0..k-1 = which singer, TOGETHER = everybody (duet only). Same seed, same turns on every device.
  if (mode === 'solo') return Array(n).fill(0);
  k = Math.max(2, k || 2);
  if (k > 2) {                                 // 3+ singers: deal the lines out fairly, so everybody gets an equal share in a random order
    const r = rng(seed), deal = [];
    while (deal.length < n) {
      const bag = [...Array(k).keys()];
      for (let i = k - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (deal.length && bag[0] === deal[deal.length - 1]) { const j = 1 + Math.floor(r() * (k - 1)); [bag[0], bag[j]] = [bag[j], bag[0]]; }
      bag.forEach(v => { if (deal.length < n) deal.push(v); });
    }
    return deal;
  }
  const r = rng(seed), out = []; let prev = -1, run = 0;
  for (let i = 0; i < n; i++) {
    let v = Math.floor(r() * k); const tog = r();
    if (mode === 'duet' && i > 0 && out[i - 1] !== TOGETHER && tog < .16) v = TOGETHER;
    else if (v === prev && run >= 2) v = k === 2 ? 1 - v : (v + 1 + Math.floor(r() * (k - 1))) % k;
    run = v === prev ? run + 1 : 1; prev = v; out.push(v);
  }
  for (let s = 0; s < k && s < n; s++) if (!out.includes(s)) {      // everybody gets at least one line
    const cnt = {}; out.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
    const j = out.findIndex(x => x !== TOGETHER && cnt[x] > 1); out[j >= 0 ? j : s] = s;
  }
  return out;
}
function labelTurns() {
  if (!current) return;
  current.turns = room.on && current.mode !== 'solo' ? makeTurns(current.seed || 1, lines.length, current.mode, (current.singers || []).length || 2) : null;
  const sing = isSinger();
  lines.forEach((_, i) => {
    const d = $('#l' + i); if (!d) return;
    delete d.dataset.who; d.style.removeProperty('--wc'); d.classList.remove('mine', 'dim');
    if (!current.turns) return;
    const v = current.turns[i];
    if (v === TOGETHER) { d.dataset.who = '👥 Together'; d.style.setProperty('--wc', 'var(--gold)'); }
    else { const nm = (current.singers && current.singers.length ? current.singers : [current.singer, current.singer2])[v]; d.dataset.who = avTxt(nm) + nm; const a = avOf(nm); if (a) d.style.setProperty('--wc', a.c); }
    d.classList.toggle('mine', ownLine(i)); d.classList.toggle('dim', sing && !ownLine(i));
  });
}
const owns = (k, i) => !!current.turns && i >= 0 && i < lines.length && (current.turns[i] === TOGETHER || current.turns[i] === k);
function openAt(k, t) {                    // may singer k be heard at lyric time t?
  let idx = -1; for (let i = 0; i < lines.length; i++) if (lines[i].t * scale <= t) idx = i;
  if (owns(k, idx)) return true;
  if (idx + 1 < lines.length && owns(k, idx + 1) && lines[idx + 1].t * scale - t < 0.5) return true;   // open a moment early
  if (owns(k, idx - 1) && t - lines[idx].t * scale < 0.35) return true;                                 // let the last word finish
  return false;
}
function gateTurns(t) {
  if (!(room.on && current && current.mode !== 'solo' && current.turns)) return;
  const me = myIdx();
  if (me >= 0 && gate) {                   // my own voice: sent to the others only on my lines
    const o = openAt(me, t) ? 1 : 0;
    if (o !== gateState) { gateState = o; try { gate.gain.setTargetAtTime(o, actx.currentTime, 0.02); } catch (e) {} $('#turn').textContent = o ? '🎤 Your line: your mic is live' : '🔇 Not your line: your mic is muted'; }
  }
  const sing = isSinger();                 // other singers: only played while it is their line
  (current.sids || []).forEach((pid, k) => {
    if (pid === room.id) return; const a = rtc.audio[pid]; if (!a) return;
    a.muted = isMutedId(pid) || !openAt(k, t - (sing ? (rtc.lat[pid] || 0) : 0));
  });
}
// Adaptive voice buffer: start small (low delay), grow only when the voice starts breaking up, shrink again when the connection is calm.
// Low-latency voice (on by default) uses a smaller buffer that grows only on real trouble and shrinks faster. Switching it applies right away.
const JB_LOW = { start: 40, min: 0, max: 180, grow: .04, step: 40, calm: 2 }, JB_SAFE = { start: 100, min: 40, max: 300, grow: .02, step: 60, calm: 3 };   // milliseconds
const jbc = () => prefs.lowLat !== false ? JB_LOW : JB_SAFE;
function setJb(pc, ms) {
  pc.getReceivers().forEach(rx => {
    if (!rx.track || rx.track.kind !== 'audio') return;
    try { rx.jitterBufferTarget = ms; } catch (e) {}
    try { rx.playoutDelayHint = ms / 1000; } catch (e) {}
  });
}
function lowLatApply() {                    // the Low-latency switch changed: restart every voice buffer from the new profile
  const J = jbc();
  Object.entries(rtc.pcs).forEach(([pid, pc]) => { delete rtc.jb[pid]; setJb(pc, J.start); });
}
function tuneJb(pid, pc, c, t) {            // c = concealed samples so far, t = all samples received so far
  const J = jbc(), a = rtc.jb[pid] || (rtc.jb[pid] = { tgt: J.start, c, t, calm: 0 }), dc = c - a.c, dt = t - a.t; a.c = c; a.t = t;
  if (dt < 24000) return;                   // wait for about half a second of audio
  const bad = dc / dt;
  if (bad > J.grow) { a.tgt = Math.min(J.max, a.tgt + J.step); a.calm = 0; setJb(pc, a.tgt); }
  else if (bad < .004) { if (++a.calm >= J.calm && a.tgt > J.min) { a.tgt = Math.max(J.min, a.tgt - 20); a.calm = 0; setJb(pc, a.tgt); } }
  else a.calm = 0;
}
async function measureLatency() {          // how late each voice arrives, so the music can be held back to match
  if (!room.on) return; let worst = 0;
  for (const [pid, pc] of Object.entries(rtc.pcs)) {
    try {
      const st = await pc.getStats(); let rtt = 0, jb = 0, conc = -1, tot = 0;
      st.forEach(x => {
        if (x.type === 'candidate-pair' && (x.nominated || x.state === 'succeeded') && x.currentRoundTripTime) rtt = Math.max(rtt, x.currentRoundTripTime);
        if (x.type === 'inbound-rtp' && x.kind === 'audio') {
          if (x.jitterBufferEmittedCount) jb = x.jitterBufferDelay / x.jitterBufferEmittedCount;
          if (x.totalSamplesReceived) { conc = x.concealedSamples || 0; tot = x.totalSamplesReceived; }
        }
      });
      if (conc >= 0) tuneJb(pid, pc, conc, tot);
      const lat = Math.min(1.2, rtt / 2 + jb + 0.06);   // + about 60 ms for capture, encoding, decoding and the sound card
      rtc.lat[pid] = rtc.lat[pid] ? rtc.lat[pid] * 0.6 + lat * 0.4 : lat; worst = Math.max(worst, rtc.lat[pid]);
    } catch (e) {}
  }
  if (!isSinger()) listenDelay = worst;
  if (worst) $('#lat').textContent = 'Voice delay about ' + Math.round(worst * 1000) + ' ms' + (!isSinger() && holdApplied > 0.05 ? ' · music held back ' + Math.round(holdApplied * 1000) + ' ms to match' : '');
}

