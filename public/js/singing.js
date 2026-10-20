// ---- singing
let frames = 0, offset = 0, active = false, lines = [], warn = '';
let prebuf = false, holding = false, loadedSent = false;   // pre-loading the video silently before the shared start
let scale = 1, autoScale = 1, lyricDur = 0, lyricId = null, force = false;
let getT = () => 0, isPlay = () => false, stopMedia = () => {};
$('#startBtn').onclick = async () => {
  if (!queue.length) { say('Queue a song first.'); return; }
  if (room.on) { roomOp({ op: 'start' }); return; }
  current = queue.shift(); localTurn++; localSung[current.singer] = localTurn; renderQueue(); say('Loading lyrics…');
  await loadAndRun();
};
async function loadAndRun() {
  const s = current.song;
  try {
    if (s.aligned) {      // timed by listening to this exact audio
      lines = s.aligned.lines.map((text, i) => ({ t: s.aligned.times[i], text }));
      warn = ' Lyrics were aligned to this audio automatically.'; lyricDur = 0; lyricId = null; autoScale = 1;
      runSong(); return;
    }
    const r = await fetch('/api/lyrics?' + new URLSearchParams({ title: s.title, artist: s.artist, duration: s.duration }));
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    lines = parseLrc(d.lrc); if (!lines.length) throw new Error('no timed lyrics found');
    warn = ''; lyricDur = d.lyricDuration || 0; lyricId = d.id || null; autoScale = 1;
    const diff = lyricDur && s.duration ? s.duration / lyricDur : 1;
    if (Math.abs(diff - 1) > .02 && Math.abs(diff - 1) < .12) { autoScale = diff; warn = ' Lyrics were stretched ' + ((diff - 1) * 100).toFixed(1) + '% to fit the song’s speed.'; }
    else if (lyricDur && s.duration && Math.abs(lyricDur - s.duration) > 3) warn = ' These lyrics are for a version ' + Math.round(Math.abs(lyricDur - s.duration)) + 's different in length. Try another lyrics version below.';
  } catch (e) {
    const msg = 'Skipped “' + s.title + '”: ' + e.message + '.';
    $('#cd').classList.remove('show'); room.prep = false; room.startAt = 0; leaveSong();   // never leave an empty stage or the countdown on screen
    if (room.on) { if (isSinger()) roomOp({ op: 'skip', reason: msg + ' Pick a song marked “synced lyrics ✓”.' }); else say(msg); }
    else { current = null; say(msg); }
    return;
  }
  runSong();
}
function loadedOnce() { if (room.on && room.prep && !loadedSent) { loadedSent = true; roomOp({ op: 'loaded' }); } }
function setOffset(v) {
  offset = Math.round(v * 10) / 10; $('#off').textContent = (offset > 0 ? '+' : '') + offset.toFixed(1) + 's';
  try { localStorage.setItem('off:' + current.song.videoId, String(offset)); } catch (e) {}
}
$('#rstTiming').onclick = () => {
  try { localStorage.removeItem('off:' + current.song.videoId); localStorage.removeItem('spd:' + current.song.videoId); } catch (e) {}
  offset = 0; $('#off').textContent = '0.0s'; setScale(autoScale, false); anchor = null; force = true;
  $('#markHint').textContent = 'Timing reset. If the lyrics are still off, click a line and press Mark when you hear it.';
};
[['s5', .5], ['s1', .1], ['l1', -.1], ['l5', -.5]].forEach(([id, d]) => $('#' + id).onclick = () => setOffset(offset + d));

function setScale(v, save = true) {
  scale = Math.min(1.12, Math.max(.88, v)); $('#spd').value = scale;
  $('#spdv').textContent = (scale >= 1 ? '+' : '') + ((scale - 1) * 100).toFixed(1) + '%';
  if (save) { try { localStorage.setItem('spd:' + current.song.videoId, String(scale)); } catch (e) {} }
}
const tweak = () => (prefs.lead || 0) - (prefs.delay || 0);
let anchor = null, pick = -1;
function markLine(i) {       // you heard line i begin: fix the offset, and with a second mark the stretch too
  const hint = $('#markHint');
  if (!isPlay() || i < 0 || i >= lines.length) { hint.textContent = 'Click a lyric line first, and make sure the music is playing.'; return; }
  const R = getT() - 0.15;   // allow for your reaction time
  let msg;
  if (anchor && anchor.i !== i && Math.abs(lines[i].t - lines[anchor.i].t) > 20) {
    const k = (R - anchor.R) / (lines[i].t - lines[anchor.i].t);
    if (k > .88 && k < 1.12) {
      setScale(k); setOffset(lines[anchor.i].t * scale - anchor.R - tweak());
      msg = 'Locked in: stretch ' + ((k - 1) * 100).toFixed(1) + '%, shift ' + offset.toFixed(1) + 's.'; anchor = null;
    } else { setOffset(lines[i].t * scale - R - tweak()); anchor = { i, R }; msg = 'Those two marks don’t fit one song (speed off by more than 12%). Only the shift was updated.'; }
  } else { setOffset(lines[i].t * scale - R - tweak()); anchor = { i, R }; msg = 'Saved. Now pick a line near the end of the song and press Mark again for the best accuracy.'; }
  hint.textContent = msg; force = true;
}
$('#syncNow').onclick = () => markLine(0);
$('#markBtn').onclick = () => markLine(pick);
$('#lyrics').onclick = e => {
  const d = e.target.closest('.ln'); if (!d) return;
  document.querySelectorAll('.ln.pick').forEach(x => x.classList.remove('pick'));
  d.classList.add('pick'); pick = +d.id.slice(1);
};
$('#spd').oninput = e => setScale(parseFloat(e.target.value));
$('#spdAuto').onclick = () => setScale(autoScale);
async function upgradeRomaji(forLines) {
  const d = await serverRomanize(forLines.map(l => l.text));
  if (!d || forLines !== lines) return;                       // song or lyrics changed while waiting
  let got = false;
  (d.lines || []).forEach((t, i) => {
    if (!t) return;
    const ln = document.getElementById('l' + i); if (!ln) return;
    let r = ln.querySelector('.r'); if (!r) { r = el('span', '', 'r'); ln.appendChild(r); }
    r.textContent = t.charAt(0).toUpperCase() + t.slice(1); ln.classList.add('hasr'); got = true;
  });
  const note = $('#romNote');
  if (d.missing && d.missing.length) { note.textContent = 'To romanize kanji and other scripts, run: pip install ' + d.missing.join(' ') + ' (then restart server.py).'; note.style.display = 'block'; }
  else if (got) note.style.display = 'block';
}
function buildLyrics() {
  const box = $('#lyrics'); box.textContent = ''; let anyRom = false, anyHan = false;
  lines.forEach((l, i) => {
    const d = el('div', null, 'ln'); d.id = 'l' + i; d.appendChild(el('span', l.text, 'o'));
    const rom = romanize(l.text); if (rom) { anyRom = true; d.classList.add('hasr'); d.appendChild(el('span', rom, 'r')); }
    if (/[\u4E00-\u9FFF]/.test(l.text)) anyHan = true;
    box.appendChild(d);
  });
  box.className = 'm-' + $('#romMode').value; $('#romNote').style.display = anyRom || anyHan ? 'block' : 'none'; upgradeRomaji(lines);
}
async function loadVersions() {
  const sel = $('#ver'), s = current.song; sel.textContent = '';
  try {
    const r = await fetch('/api/versions?' + new URLSearchParams({ title: s.title, artist: s.artist, duration: s.duration }));
    const list = await r.json(); if (!r.ok) throw new Error(list.error);
    list.forEach(v => { const o = el('option', v.artist + ' – ' + v.title + ' · ' + fmt(v.duration) + ' (' + (v.diff > 0 ? '+' : '') + Math.round(v.diff) + 's)'); o.value = v.id; sel.appendChild(o); });
    if (!list.length) sel.appendChild(el('option', 'No other versions found'));
    else if (lyricId && list.some(v => String(v.id) === String(lyricId))) sel.value = lyricId;
  } catch (e) { sel.appendChild(el('option', 'Could not load versions')); }
}
$('#ver').onchange = async () => {
  const id = $('#ver').value; if (!id) return;
  try {
    const r = await fetch('/api/lyrics?id=' + encodeURIComponent(id)), d = await r.json(); if (!r.ok) throw new Error(d.error);
    const nl = parseLrc(d.lrc); if (!nl.length) throw new Error('that version has no timed lyrics');
    lines = nl; lyricId = id; lyricDur = d.lyricDuration || 0;
    const diff = lyricDur && current.song.duration ? current.song.duration / lyricDur : 1;
    autoScale = Math.abs(diff - 1) > .02 && Math.abs(diff - 1) < .12 ? diff : 1;
    S.lf = lines.map(() => 0); S.lv = lines.map(() => 0); S.hit = lines.map(() => 0);
    buildLyrics(); labelTurns(); setScale(autoScale); force = true;
  } catch (e) { say('Could not switch lyrics: ' + e.message); }
};
async function runSong() {
  $('#home').style.display = 'none'; $('#stage').style.display = 'block'; $('#rate').style.display = 'none';
  $('#now').textContent = whoTxt(current) + (current.singer2 ? ' are singing' : ' is singing') + ': ' + current.song.title + (current.mode && current.mode !== 'solo' ? ' (' + modeName[current.mode] + ')' : ''); $('#liveScore').textContent = '0';
  const box = $('#lyrics'); box.textContent = '';
  let anyRom = false, anyHan = false;
  lines.forEach((l, i) => {
    const d = el('div', null, 'ln'); d.id = 'l' + i; d.appendChild(el('span', l.text, 'o'));
    const rom = romanize(l.text); if (rom) { anyRom = true; d.classList.add('hasr'); d.appendChild(el('span', rom, 'r')); }
    if (/[\u4E00-\u9FFF]/.test(l.text)) anyHan = true;
    box.appendChild(d);
  });
  box.className = 'm-' + $('#romMode').value; $('#romNote').style.display = anyRom || anyHan ? 'block' : 'none'; upgradeRomaji(lines);
  box.scrollTop = 0; frames = 0; active = true; drawMeter(0, 0); renderNow();
  labelTurns(); fxStart();
  S = { voiced: 0, rms: 0, clear: 0, clip: 0, lf: lines.map(() => 0), lv: lines.map(() => 0), hit: lines.map(() => 0) };
  let saved = 0; try { saved = parseFloat(localStorage.getItem('off:' + current.song.videoId)) || 0; } catch (e) {}
  setOffset(saved);
  if (Math.abs(saved) >= 2) $('#markHint').textContent = 'This song still has a saved timing shift of ' + saved.toFixed(1) + 's from an earlier try. Press Reset timing if the lyrics do not match.';
  let sv = NaN; try { sv = parseFloat(localStorage.getItem('spd:' + current.song.videoId)); } catch (e) {}
  setScale(isNaN(sv) ? autoScale : sv, false); loadVersions();

  an = null; document.body.classList.toggle('aud', room.on && !isSinger());
  if (room.on && !isSinger()) {
    $('#micNote').textContent = 'Listening to ' + current.singer + ' sing live. Adjust their voice below.'; hookRemote();
  } else try {
    const mid = $('#micSel').value;
    stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign(micC(), mid ? { deviceId: { exact: mid } } : {}) });
    actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume().catch(() => {}); vdest = null;
    an = actx.createAnalyser(); an.fftSize = 2048; micGain = actx.createGain(); micGain.gain.value = prefs.sens;
    micSrc = actx.createMediaStreamSource(stream); micSrc.connect(micGain); micGain.connect(an);
    if (room.on) {   // what friends hear = your mic after the sensitivity gain, with a limiter so loud notes do not crackle
      const lim = actx.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 8; lim.ratio.value = 12; lim.attack.value = .003; lim.release.value = .2;
      vdest = actx.createMediaStreamDestination(); gate = actx.createGain(); gate.gain.value = current.mode === 'solo' ? 1 : 0; gateState = -1; micGain.connect(lim); lim.connect(gate); gate.connect(vdest);
    }
    $('#micNote').textContent = 'Mic is on. Headphones keep the music out of your score.';
    if (room.on && stream) { rtc.stream = vdest ? vdest.stream : stream; connectPeers(); }
  } catch (e) { $('#micNote').textContent = 'No mic access, so there is no automatic score this round.'; }
  $('#micNote').textContent += warn;

  const wrap = $('#ytwrap'); wrap.textContent = '';
  const card = $('#ytcard'); card.classList.add('show');
  (matchMedia('(min-width:1000px)').matches ? $('#sideSlot').parentNode.insertBefore(card, $('#sideSlot')) : $('#ytslot').appendChild(card));
  if (current.file) {
    const a = new Audio(URL.createObjectURL(current.file)); audio = a; a.volume = prefs.vol / 100;
    const oid = $('#outSel').value;
    if (oid && a.setSinkId) { try { await a.setSinkId(oid); } catch (e) { $('#micNote').textContent += ' Could not use that speaker.'; } }
    a.onended = () => finish();
    a.onpause = () => { if (active && !a.ended) a.play().catch(() => {}); };
    getT = () => a.currentTime; isPlay = () => !a.paused && !a.ended;
    stopMedia = () => { a.onpause = null; a.pause(); audio = null; };
    a.play().catch(() => { $('#micNote').textContent = 'The browser blocked the audio. Tap Finish early and try again.'; });
  } else {
    await loadYT();
    if (player) { try { player.destroy(); } catch (e) {} }
    const holder = el('div'); holder.id = 'yt'; wrap.appendChild(holder);
    player = new YT.Player('yt', { width: 200, height: 200, videoId: current.song.videoId,
      playerVars: { autoplay: (room.on && (room.startAt || room.prep)) ? 0 : 1, playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, origin: location.origin },
      events: {
        onReady: e => {
          try { e.target.setVolume(prefs.vol); } catch (x) {}
          if (room.on && room.prep) {        // load the video silently now, so it starts the instant everyone is ready
            prebuf = true; try { e.target.mute(); } catch (x) {} e.target.playVideo();
            setTimeout(() => { if (prebuf) { prebuf = false; try { e.target.unMute(); } catch (x) {} loadedOnce(); } }, 9000);
          } else if (!(room.on && room.startAt)) e.target.playVideo();
        },
        onError: e => { $('#micNote').textContent = 'YouTube won’t play this video here (error ' + e.data + '). Tap Finish early to skip it.'; loadedOnce(); },
        onStateChange: e => {
          if (prebuf && e.data === YT.PlayerState.PLAYING) {   // the video really is playable: park it at the start and tell the room we are ready
            prebuf = false; holding = true; e.target.pauseVideo();
            try { e.target.seekTo(0, true); e.target.unMute(); } catch (x) {}
            setTimeout(() => { holding = false; }, 700); loadedOnce(); return;
          }
          if (e.data === YT.PlayerState.ENDED) finish(); else if (e.data === YT.PlayerState.PAUSED && active && !holding) e.target.playVideo();
        }
      } });
    getT = () => player.getCurrentTime();
    isPlay = () => !!(player && player.getPlayerState && player.getPlayerState() === 1);
    stopMedia = () => { if (player) { try { player.destroy(); } catch (e) {} player = null; } };
    if (room.on && room.startAt) startSync();
    if (room.on) { clearInterval(latIv); latIv = setInterval(() => { if (!active) clearInterval(latIv); else measureLatency(); }, 2000); }
    setTimeout(() => {
      const st = player && player.getPlayerState ? player.getPlayerState() : -1;
      if (active && (!room.on || room.startAt) && st !== 1 && st !== 3) $('#micNote').textContent = 'The video isn’t playing. Use Chrome, Edge, or Brave, or tap Finish early to skip.';
    }, 8000 + (room.on && room.startAt ? Math.max(0, room.startAt - (Date.now() + room.skew)) : 0));
  }

  const endT = () => lines[lines.length - 1].t * scale + 8, fb = new Float32Array(2048);
  const lineEnd = i => Math.min(lines[i + 1] ? lines[i + 1].t * scale : lines[i].t * scale + 4, lines[i].t * scale + 6);
  let last = -1, lvl = 0, peak = 0, pkT = 0, clr = 0, liveT = 0, clkT = 0;
  // Countdown in the lyrics area, so everyone knows when to come in: while the music is starting, before the first line, and after long instrumental breaks.
  const lyC = $('#lyCount'), lyN = $('#lyNum'), lyL = $('#lyLbl'), lyD = $('#lyDots'); let lyKey = '', everPlayed = false;
  const lyShow = (n, label) => {      // n = whole seconds left (0 = just show the message), label '' = hide
    const key = label ? n + '|' + label : ''; if (key === lyKey) return; lyKey = key;
    if (!label) { lyC.classList.remove('show'); return; }
    lyC.style.height = $('#lyrics').clientHeight + 'px'; lyL.textContent = label; lyN.textContent = n || ''; lyD.textContent = '';
    for (let k = 0; k < Math.min(3, n); k++) lyD.appendChild(el('i'));
    lyC.classList.toggle('wait', !n); lyC.classList.remove('show'); void lyC.offsetWidth; lyC.classList.add('show');   // restart the pop animation for every new number
  };
  const tick = now => {
    if (!active) { lyShow(0, ''); return; }
    const playing = isPlay(), t = playing ? getT() + offset + tweak() : -1;
    if (playing && current.song.bpm) { const ph = (((getT() - (current.song.lead || 0)) * current.song.bpm / 60) % 1 + 1) % 1; document.body.style.setProperty('--beat', Math.pow(1 - ph, 3).toFixed(2)); }
    let idx = -1; for (let i = 0; i < lines.length; i++) if (lines[i].t * scale <= t) idx = i;
    gateTurns(t);
    if (now - clkT > 250) {
      clkT = now; const raw = playing ? getT() : 0, first = lines[0].t * scale - offset - tweak();
      const pr = $('#prog'); if (pr && current.song.duration) pr.style.width = Math.min(100, raw / current.song.duration * 100) + '%';
      $('#clock').textContent = !playing ? 'Waiting for the music to start…'
        : idx < 0 ? 'Song time ' + fmt(raw) + ' · first lyric line at ' + fmt(Math.max(0, first)) + ' (in ' + Math.max(0, Math.round(first - raw)) + 's)'
        : 'Song time ' + fmt(raw) + ' · line ' + (idx + 1) + ' of ' + lines.length;
    }
    if (idx >= 0 && playing) { const a = lines[idx].t * scale, gap = lineEnd(idx) - a, est = Math.min(gap * 0.95, Math.max(1, (lines[idx].text || '').length * 0.14)), p = Math.max(0, Math.min(1, (t - a) / Math.max(0.5, est))); const n = $('#l' + idx); if (n) n.style.setProperty('--fill', (p * 100).toFixed(1) + '%'); }
    { let cn = 0, cl = '';
      if (!playing) { const toGo = room.on && room.startAt ? room.startAt - (Date.now() + room.skew) : 0; if (toGo > 0 && toGo <= 9000) { cn = Math.ceil(toGo / 1000); cl = 'Song starts in'; } else cl = everPlayed ? 'Waiting for the music…' : 'Song starting…'; }
      else { everPlayed = true; const nx = lines[idx + 1];
        if (nx) { const left = nx.t * scale - t; if (left > 0 && left <= 3 && (idx < 0 || nx.t * scale - lines[idx].t * scale >= 9)) { cn = Math.ceil(left); cl = idx < 0 ? 'First line in' : 'Next line in'; } } }
      lyShow(cn, cl); }
    if (idx !== last || force) { force = false;
      last = idx;
      lines.forEach((_, i) => { const e = $('#l' + i); e.classList.toggle('now', i === idx); e.classList.toggle('past', i < idx); e.classList.toggle('next', i === idx + 1); });
      const d = $('#l' + Math.max(idx, 0)); box.scrollTo({ top: d.offsetTop - box.clientHeight / 2 + d.offsetHeight / 2, behavior: prefs.calm ? 'auto' : 'smooth' });
    }
    if (an && playing) {
      an.getFloatTimeDomainData(fb); let s = 0, mx = 0;
      for (const v of fb) { s += v * v; const a = Math.abs(v); if (a > mx) mx = a; }
      const rms = Math.sqrt(s / fb.length);
      lvl = Math.max(Math.min(1, rms * 5), lvl * .86);
      if (lvl >= peak) { peak = lvl; pkT = now; } else if (now - pkT > 600) peak = Math.max(lvl, peak - .02);
      drawMeter(lvl, peak);
      if (++frames % 2 === 0) clr = clarity(fb, actx.sampleRate);
      const voiced = rms > .02;
      if (voiced && (idx < 0 || ownLine(idx))) { S.voiced++; S.rms += rms; if (clr > .45) S.clear++; if (mx > .95) S.clip++; }
      if (idx >= 0 && t < lineEnd(idx)) { S.lf[idx]++; if (voiced) { S.lv[idx]++; if (t - lines[idx].t * scale < 2) S.hit[idx] = 1; } }
      if (now - liveT > 300 && idx >= 0) { liveT = now; const sc = total(compute(idx + 1)); $('#liveScore').textContent = sc; const ns = $('#nowScore'); if (ns) ns.textContent = sc + ' pts'; }
    }
    fxTick(now, t, idx, playing, an && playing ? lvl : -1);
    if (t >= endT()) return finish();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); lastTick = performance.now();
  };
  let lastTick = performance.now();
  raf = requestAnimationFrame(tick);
  const keep = setInterval(() => { if (!active) clearInterval(keep); else if (performance.now() - lastTick > 400) tick(performance.now()); }, 250);   // browsers pause animation frames in hidden tabs
}
$('#stopBtn').onclick = () => { if (room.on && !isSinger()) leaveSong(); else finish(); };

function finish() {
  if (!active) return; active = false; renderNow();
  cancelAnimationFrame(raf); stopMedia(); $('#ytcard').classList.remove('show'); drawMeter(0, 0); document.body.style.removeProperty('--beat');
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (actx) actx.close();
  const hasMic = !!an && S.voiced > 0, parts = compute(lines.length), pts = hasMic ? total(parts) : 0;
  const cbo = comboFinish();   // combo: lines sung in a row
  closeRtc();
  if (room.on) { if (isSinger()) roomOp({ op: 'score', pts, parts, hasMic, combo: cbo }); else { awaiting = true; if (pendingResult) { const r = pendingResult; pendingResult = null; onResultShow(r); } else setTimeout(() => { if (awaiting) { awaiting = false; showResult(0, { Singing: 0, Tone: 0, Volume: 0, Timing: 0 }, false); $('#scoreNote').textContent = 'Song finished.'; } }, 8000); return; } }
  else { scores[current.singer] = (scores[current.singer] || 0) + pts + cbo.bonus; renderScores(); histLocal(current.song, [current.singer], [{ name: current.singer, pts, bonus: cbo.bonus }]); }
  setAwData({ name: room.on ? room.name : current.singer, pts, parts, hasMic, combo: cbo });
  showResult(pts, parts, hasMic);
}
function showResult(pts, parts, hasMic) {
  const bk = $('#bk'); bk.textContent = '';
  Object.keys(MAXP).forEach(k => {
    const row = el('div', null, 'bk'), bar = el('div'), fill = el('i'); bar.appendChild(fill);
    row.append(el('span', k), bar, el('span', Math.round(parts[k]) + '/' + MAXP[k])); bk.appendChild(row);
    setTimeout(() => fill.style.width = (hasMic ? parts[k] / MAXP[k] * 100 : 0) + '%', 60);
  });
  $('#rank').textContent = !hasMic ? 'No mic, no score' : pts >= 90 ? 'Superstar!' : pts >= 75 ? 'Crowd pleaser' : pts >= 55 ? 'Warming up' : pts >= 30 ? 'Getting there' : 'Grab the mic closer';
  $('#scoreNote').textContent = hasMic ? 'Scored from how much you sang on each line, how clear your tone was, your volume, and how quickly you came in.' : 'Allow the microphone to get a score next time.';
  $('#rate').style.display = 'block'; $('#big').textContent = '0'; renderAud(); comboRow($('#bk'), (awData.list[0] || {}).combo); renderAwards();
  const ring = $('#ring'); ring.style.setProperty('--p', 0);
  setTimeout(() => ring.style.setProperty('--p', pts), 60);
  const t0 = performance.now(), up = n => { const k = Math.min(1, (n - t0) / 1400); $('#big').textContent = Math.round(pts * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(up); };
  requestAnimationFrame(up);
  confetti(pts);
  $('#rate').scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!room.on && queue.length) nextCountdown(10, queue[0], true);                       // same-device play: auto-advance too
  else if (room.on && nextInfo && nextInfo.end > Date.now()) nextCountdown(Math.ceil((nextInfo.end - Date.now()) / 1000), nextInfo.item, false);
}
// After a song: a visible countdown to the next one, and no "back" button while a next song is on its way.
let nextOn = false, nextIv = 0, nextFail = 0, nextInfo = null;
function nextStop() { clearInterval(nextIv); clearTimeout(nextFail); nextOn = false; $('#nextBox').style.display = 'none'; $('#back').style.display = ''; }
function nextCountdown(secs, item, solo) {
  nextStop(); nextOn = true; const end = Date.now() + secs * 1000, txt = $('#nextTimer'), bar = $('#nextBar');
  $('#nextBox').style.display = 'block'; $('#back').style.display = 'none'; $('#nextCancel').style.display = solo ? '' : 'none';
  const label = item.song.title + ' (' + whoTxt(item) + ')';
  const tick = () => {
    const left = Math.ceil((end - Date.now()) / 1000);
    if (left > 0) { txt.textContent = 'Next up: ' + label + ' in ' + left + 's…'; bar.style.width = (100 - left / secs * 100) + '%'; return; }
    clearInterval(nextIv); bar.style.width = '100%';
    if (solo) { nextStop(); $('#startBtn').click(); }
    else txt.textContent = 'Next up: ' + label + '. Getting everyone set…';
  };
  tick(); if (nextOn) nextIv = setInterval(tick, 250);
  nextFail = setTimeout(nextStop, (secs + 75) * 1000);   // safety net: the menu button always comes back if nothing starts
}
$('#nextCancel').onclick = () => nextStop();
$('#back').onclick = () => { refreshTheme(); document.body.classList.remove('aud'); $('#stage').style.display = 'none'; $('#home').style.display = 'block'; say('Pick the next song when you’re ready.'); };

function renderScores() {
  const box = $('#sideScores'); box.textContent = '';
  const names = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  if (!names.length) { box.appendChild(el('p', 'No scores yet.', 'note')); return; }
  names.forEach(n => { const r = el('div', null, 'sc'); r.append(el('span', avTxt(n) + n), el('b', scores[n] + ' pts')); box.appendChild(r); });
}

