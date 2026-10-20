// Shared clock: in a room the video position is where the room's clock says it should be.
let syncIv = 0, lastSeek = 0;
function startSync() {
  clearInterval(syncIv); lastSeek = 0;
  const run = () => {
    if (!active || !player || !player.getPlayerState || !room.startAt) return;
    const exp = (Date.now() + room.skew - room.startAt) / 1000, st = player.getPlayerState(), dur = current.song.duration || 1e9;
    if (exp < -0.3 || st === 0 || exp > dur) return;                         // not time yet, or the song is over
    if (st !== 1 && st !== 3) { try { player.playVideo(); } catch (e) {} }   // (re)start, also after the tab was hidden
    if (st === 1 && exp > 0.5 && Math.abs(player.getCurrentTime() - exp) > 0.7 && Date.now() - lastSeek > 4000) {
      lastSeek = Date.now(); try { player.seekTo(exp + 0.3, true); } catch (e) {}   // +0.3s: the seek takes a moment to resume
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
function makeTurns(seed, n, mode, k) {        // 0..k-1 = which singer, 2 = together (duet only, k = 2). Same seed, same turns on every device.
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
    if (mode === 'duet' && i > 0 && out[i - 1] !== 2 && tog < .16) v = 2;
    else if (v === prev && run >= 2) v = k === 2 ? 1 - v : (v + 1 + Math.floor(r() * (k - 1))) % k;
    run = v === prev ? run + 1 : 1; prev = v; out.push(v);
  }
  for (let s = 0; s < k && s < n; s++) if (!out.includes(s)) {      // everybody gets at least one line
    const cnt = {}; out.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
    const j = out.findIndex(x => x !== 2 && cnt[x] > 1); out[j >= 0 ? j : s] = s;
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
    if (v === 2) { d.dataset.who = '👥 Together'; d.style.setProperty('--wc', 'var(--gold)'); }
    else { const nm = (current.singers && current.singers.length ? current.singers : [current.singer, current.singer2])[v]; d.dataset.who = avTxt(nm) + nm; const a = avOf(nm); if (a) d.style.setProperty('--wc', a.c); }
    d.classList.toggle('mine', ownLine(i)); d.classList.toggle('dim', sing && !ownLine(i));
  });
}
const owns = (k, i) => !!current.turns && i >= 0 && i < lines.length && (current.turns[i] === 2 || current.turns[i] === k);
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
    a.muted = !openAt(k, t - (sing ? (rtc.lat[pid] || 0) : 0));
  });
}
async function measureLatency() {          // how late each voice arrives, so the music can be held back to match
  if (!room.on) return; let worst = 0;
  for (const [pid, pc] of Object.entries(rtc.pcs)) {
    try {
      const st = await pc.getStats(); let rtt = 0, jb = 0;
      st.forEach(x => {
        if (x.type === 'candidate-pair' && (x.nominated || x.state === 'succeeded') && x.currentRoundTripTime) rtt = Math.max(rtt, x.currentRoundTripTime);
        if (x.type === 'inbound-rtp' && x.kind === 'audio' && x.jitterBufferEmittedCount) jb = x.jitterBufferDelay / x.jitterBufferEmittedCount;
      });
      const lat = Math.min(1.2, rtt / 2 + jb + 0.04);
      rtc.lat[pid] = rtc.lat[pid] ? rtc.lat[pid] * 0.6 + lat * 0.4 : lat; worst = Math.max(worst, rtc.lat[pid]);
    } catch (e) {}
  }
  if (!isSinger()) listenDelay = worst;
  if (worst) $('#lat').textContent = 'Voice delay about ' + Math.round(worst * 1000) + ' ms';
}

