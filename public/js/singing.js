// ---- singing
let frames = 0, offset = 0, active = false, lines = [], warn = '', anchors = [], nudgeBase = null;
let prebuf = false, holding = false, loadedSent = false;   // pre-loading the video silently before the shared start
const AUTO_STRETCH = false;   // true = stretch the lyrics to the video's length when it differs by 2-12% (drifts when the difference is only extra intro/outro)
let scale = 1, autoScale = 1, lyricDur = 0, lyricId = null, force = false;
let getT = () => 0, isPlay = () => false, stopMedia = () => {};
// Moves the gold fill and the bouncing dot along the line being sung. A long line wraps onto several rows; the fill (CSS, one sliced inline box) runs through
// them in reading order and this puts the dot at the matching spot on the right row. Positions are measured in the line's own (untransformed) units,
// so the beat-pulse scale and the pop-in animation do not throw it off.
function fillLine(n, pv) {
  const o = n.firstElementChild; if (!o) return;
  const key = o.offsetWidth + 'x' + o.offsetHeight + 'x' + innerWidth + 'x' + n.offsetWidth;
  if (n._pf === pv && n._gk === key) return;
  n._pf = pv; n.style.setProperty('--fill', pv + '%');
  let b = n._ball; if (!b) { b = n._ball = el('span', null, 'ball'); b.appendChild(document.createElement('i')); n.appendChild(b); }
  if (n._gk !== key) {                                           // geometry only changes with the font size, window size or text
    n._gk = key; const nr = n.getBoundingClientRect(), k = nr.width / (n.offsetWidth || 1) || 1;
    n._geo = [...o.getClientRects()].filter(r => r.width > 0.5).map(r => ({ x: (r.left - nr.left) / k, y: (r.top - nr.top) / k, w: r.width / k }));
  }
  const g = n._geo; if (!g || !g.length) return;
  const W = g.reduce((t, r) => t + r.w, 0); let d = pv / 100 * W, i = 0;
  while (i < g.length - 1 && d > g[i].w) { d -= g[i].w; i++; }
  b.style.transform = 'translate(' + (g[i].x + d).toFixed(1) + 'px,' + g[i].y.toFixed(1) + 'px)';
}
// Karaoke versions: lyrics are always fetched for the ORIGINAL song (current.song.title/artist/duration), but the video that
// plays can be a karaoke track (current.song.kv). Saved timing is kept per PLAYING video, so a karaoke track never inherits
// (or overwrites) the shift you fixed for the original recording.
const pvid = () => (current.song.kv && current.song.kv.videoId) || current.song.videoId;
const playDur = () => (current.song.kv && current.song.kv.duration) || current.song.duration;
function calcScale() {      // -> { scale, warn } for the video that will play
  const pd = playDur(); let sc = 1, w = '';
  if (current.song.kv) {
    // A karaoke track is the same arrangement, so the speed is the same. A length difference is almost always extra intro/outro,
    // which needs a SHIFT (one Mark click), never a stretch, so the lyrics are not stretched here.
    if (lyricDur && pd && Math.abs(pd - lyricDur) > 3) w = ' This karaoke track is ' + Math.round(Math.abs(pd - lyricDur)) + 's ' + (pd > lyricDur ? 'longer' : 'shorter') + ' than the lyrics’ version, so the lyrics may start a little early or late. Press [ or ] to nudge the lyrics into line near the start and again later in the song: each fix is a sync point that is remembered for this track.';
  } else {
    const diff = lyricDur && pd ? pd / lyricDur : 1;
    if (Math.abs(diff - 1) > .02 && Math.abs(diff - 1) < .12) {
      if (AUTO_STRETCH) { sc = diff; w = ' Lyrics were stretched ' + ((diff - 1) * 100).toFixed(1) + '% to fit the song’s speed.'; }
      else w = ' This video is ' + Math.round(Math.abs(pd - lyricDur)) + 's ' + (pd > lyricDur ? 'longer' : 'shorter') + ' than the lyrics’ version (extra intro or outro?). If the lyrics drift during the song, press [ or ] to nudge them, or use Mark on a line near the start and one near the end.';
    }
    else if (lyricDur && pd && Math.abs(lyricDur - pd) > 3) w = ' These lyrics are for a version ' + Math.round(Math.abs(lyricDur - pd)) + 's different in length. Try another lyrics version below.';
  }
  return { scale: sc, warn: w };
}
$('#startBtn').onclick = async () => {
  if (!queue.length) { say('Queue a song first.'); return; }
  if (room.on) { roomOp({ op: 'start' }); return; }
  current = queue.shift(); localTurn++; localSung[current.singer] = localTurn; renderQueue(); say('Loading lyrics…');
  await loadAndRun();
};
async function loadAndRun() {
  stopPreview();      // a search preview must never play over the song
  const s = current.song;
  try {
    const r = await fetch('/api/lyrics?' + new URLSearchParams({ title: s.title, artist: s.artist, duration: s.duration }));
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    lines = parseLrc(d.lrc); if (!lines.length) throw new Error('no timed lyrics found');
    lyricDur = d.lyricDuration || 0; lyricId = d.id || null;
    const cs = calcScale(); autoScale = cs.scale; warn = cs.warn;
  } catch (e) {
    // No timed lyrics (none exist, or the lyrics service is down): the song still plays, just without the moving words.
    lines = []; lyricDur = 0; lyricId = null; autoScale = 1; warn = '';
    say('No synced lyrics for “' + s.title + '” right now (' + e.message + '), so it plays without them.');
  }
  runSong();
}
function loadedOnce() { if (room.on && room.prep && !loadedSent) { loadedSent = true; roomOp({ op: 'loaded', first: lines && lines.length ? Math.max(0, +(lines[0].t * scale - offset).toFixed(2)) : 99 }); } }
// The lyrics are timed to the ORIGINAL recording, so a karaoke track usually needs a shift. Once someone fixes it, the fix is kept on the server
// for that track (for everybody, every time), and in a room it is sent to everyone live, so each person does not have to fix it on their own.
const canShareTiming = () => !room.on || isSinger() || room.host === room.id;
let tmTimer = 0;
function shareTimingSoon() {
  if (!current || !active || !canShareTiming()) return;
  clearTimeout(tmTimer);
  tmTimer = setTimeout(() => {
    const v = pvid(), o = offset, s = scale;
    const a = anchors.map(p => [p.L, p.V]);
    rpost('/api/timing', { v, l: lyricId || '', o, s, a }).catch(() => {});
    if (room.on) roomOp({ op: 'timing', v, o, s, a });
  }, 700);
}
function onTiming(m) {       // the singer (or host) fixed the timing: use it right away
  if (!active || !current || m.v !== pvid() || m.by === room.name) return;
  anchors = cleanAnchors(m.a); applyWarp(); setOffset(m.o, false); setScale(m.s, false); force = true;
  $('#markHint').textContent = (m.by || 'The singer') + ' adjusted the lyric timing for everyone.';
}
function setOffset(v, share = true) {
  offset = Math.round(v * 10) / 10; $('#off').textContent = (offset > 0 ? '+' : '') + offset.toFixed(1) + 's';
  try { localStorage.setItem('off:' + pvid(), String(offset)); } catch (e) {}
  if (share) shareTimingSoon();
}
$('#rstTiming').onclick = () => {
  try { localStorage.removeItem('off:' + pvid()); localStorage.removeItem('spd:' + pvid()); localStorage.removeItem('anc:' + pvid()); } catch (e) {}
  offset = 0; $('#off').textContent = '0.0s'; setScale(autoScale, false); anchors = []; nudgeBase = null; applyWarp(); force = true; shareTimingSoon();
  $('#markHint').textContent = 'Timing reset (all sync points cleared). If the lyrics are still off, press [ or ] to nudge them into line, or click a line and press Mark when you hear it.';
};
let fixPend = null, fixTimer = 0;
// <sync-points>
// SYNC POINTS (piecewise timing). A karaoke track is a different recording from the one the lyrics were timed to, so the lyric file
// and the video drift apart by different amounts in different parts of the song (longer intro, extra instrumental break, ...).
// One shift + one stretch cannot describe that. A sync point is one fact: "this lyric line (original time L) really starts at video time V".
// The lyrics are warped through all sync points: exact at each one, evenly spread in between, and a plain shift before the first / after the last.
// With one sync point this is exactly the old single shift; every extra one fixes the next stretch of the song. The result is baked into
// lines[i].t (the original time stays in lines[i].t0), so the rest of the app (scale / offset / scoring / rooms) keeps working unchanged.
function cleanAnchors(a) {      // -> sorted [{L, V}], both times strictly increasing, believable speed between neighbours (same rules as the server)
  const pts = (Array.isArray(a) ? a : []).slice(0, 24).map(p => Array.isArray(p) ? { L: +p[0], V: +p[1] } : { L: +(p && p.L), V: +(p && p.V) })
    .filter(p => isFinite(p.L) && isFinite(p.V) && p.L >= 0 && p.L <= 1800 && p.V >= 0 && p.V <= 2400).sort((x, y) => x.L - y.L);
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q) { const dl = p.L - q.L, dv = p.V - q.V; if (dl < 1 || dv <= 0 || dv / dl < .5 || dv / dl > 2) continue; }
    out.push({ L: Math.round(p.L * 100) / 100, V: Math.round(p.V * 100) / 100 });
  }
  return out.slice(0, 12);
}
function warpT(L) {             // lyric time -> video time
  const a = anchors; if (!a.length) return L;
  if (L <= a[0].L) return L + a[0].V - a[0].L;
  for (let i = 1; i < a.length; i++) if (L <= a[i].L) return a[i - 1].V + (a[i].V - a[i - 1].V) * (L - a[i - 1].L) / (a[i].L - a[i - 1].L);
  const z = a[a.length - 1]; return L + z.V - z.L;
}
function unwarpT(V) {           // video time -> lyric time
  const a = anchors; if (!a.length) return V;
  if (V <= a[0].V) return V - a[0].V + a[0].L;
  for (let i = 1; i < a.length; i++) if (V <= a[i].V) return a[i - 1].L + (a[i].L - a[i - 1].L) * (V - a[i - 1].V) / (a[i].V - a[i - 1].V);
  const z = a[a.length - 1]; return V - z.V + z.L;
}
function applyWarp() {          // bake the sync points into the line times
  lines.forEach(l => { if (l.t0 === undefined) l.t0 = l.t; l.t = warpT(l.t0); });
  force = true;
  try { if (anchors.length) localStorage.setItem('anc:' + pvid(), JSON.stringify(anchors)); else localStorage.removeItem('anc:' + pvid()); } catch (e) {}
}
function bakeGlobal() {         // fold the shift / speed controls into the sync points, so a new sync point does not change the rest of the song
  if (offset === 0 && scale === 1) return;
  let a = anchors.map(p => ({ L: p.L, V: p.V * scale - offset }));
  if (!a.length && lines.length) {                // no sync points yet: the old shift + speed becomes one or two of them
    const f = lines[0].t0, e = lines[lines.length - 1].t0;
    a = scale === 1 || e - f < 5 ? [{ L: f, V: f * scale - offset }] : [{ L: f, V: f * scale - offset }, { L: e, V: e * scale - offset }];
  }
  setOffset(0, false); setScale(1, false); anchors = cleanAnchors(a);
}
function addAnchor(L, V, base) {   // line with original time L really starts at video time V (tweak-free). base = the shift / speed to keep for the rest of the song
  if (base) { const o = offset, sc = scale; offset = base.o; scale = base.s; bakeGlobal(); offset = o; scale = sc; }
  else bakeGlobal();
  setOffset(0, false); setScale(1, false);
  anchors = cleanAnchors(anchors.filter(p => Math.abs(p.L - L) > 8).concat([{ L, V }]));    // marking again near the same moment refines it
  applyWarp(); shareTimingSoon();
  return anchors.length;
}
// </sync-points>
function toastMsg(txt) {
  let tt = $('#syncToast'); if (!tt) { tt = el('div'); tt.id = 'syncToast'; tt.setAttribute('role', 'status'); document.body.appendChild(tt); }
  tt.textContent = txt; tt.classList.add('show'); clearTimeout(nudgeT); nudgeT = setTimeout(() => tt.classList.remove('show'), 2600);
}
function nudge(d) {             // [ ] / Sooner / Later: once you stop nudging for 4 s the lyrics are "right" at that moment = a new sync point
  if (!nudgeBase) nudgeBase = { o: offset, s: scale };
  setOffset(offset + d);       // shared live (rooms see it at once); the sync point below makes it permanent
  if (!active || !lines.length || !isPlay()) return;
  const T = getT(); fixPend = { T, b: (T + offset + tweak()) / scale };
  clearTimeout(fixTimer); fixTimer = setTimeout(() => {
    const p = fixPend; fixPend = null; if (!p || !active) return;
    const n = addAnchor(unwarpT(p.b), p.T + tweak(), nudgeBase); nudgeBase = null;
    toastMsg(n < 2 ? 'Sync point saved for this track.' : 'Sync point ' + n + ' saved. The lyrics between your sync points are spaced to fit.');
  }, 4000);
}
[['s5', .5], ['s1', .1], ['l1', -.1], ['l5', -.5]].forEach(([id, d]) => $('#' + id).onclick = () => nudge(d));
let nudgeT = 0;
addEventListener('keydown', e => {          // [ = lyrics sooner, ] = lyrics later; Shift = bigger steps
  if (!active || e.ctrlKey || e.metaKey || e.altKey || (e.key !== '[' && e.key !== ']' && e.key !== '{' && e.key !== '}')) return;
  const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  e.preventDefault(); const sooner = e.key === '[' || e.key === '{', step = e.shiftKey || e.key === '{' || e.key === '}' ? .5 : .1;
  nudge(sooner ? step : -step);
  toastMsg('Lyrics ' + step.toFixed(1) + 's ' + (sooner ? 'sooner' : 'later') + ' (shift ' + (offset > 0 ? '+' : '') + offset.toFixed(1) + 's)');
});

function setScale(v, save = true) {
  scale = Math.min(1.12, Math.max(.88, v)); $('#spd').value = scale;
  $('#spdv').textContent = (scale >= 1 ? '+' : '') + ((scale - 1) * 100).toFixed(1) + '%';
  if (save) { try { localStorage.setItem('spd:' + pvid(), String(scale)); } catch (e) {} shareTimingSoon(); }
}
const tweak = () => (prefs.lead || 0) - (prefs.delay || 0);
let pick = -1;
function markLine(i) {       // you heard line i begin: that is a sync point (the lyrics are warped through all of them)
  const hint = $('#markHint');
  if (!isPlay() || i < 0 || i >= lines.length) { hint.textContent = 'Click a lyric line first, and make sure the music is playing.'; return; }
  const R = getT() - 0.15;   // allow for your reaction time
  const n = addAnchor(lines[i].t0, R + tweak(), null); nudgeBase = null;
  hint.textContent = n < 2 ? 'Sync point 1 saved. For the best accuracy, mark a line after any long instrumental break and one near the end.'
    : 'Sync point ' + n + ' saved. The lyrics between your sync points are spaced evenly, so add one after each long instrumental break.';
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
    const cs = calcScale(); autoScale = cs.scale; warn = cs.warn; $('#micNote').textContent = $('#micNote').textContent.replace(/ (Lyrics were stretched|This video is|These lyrics are for a version|This karaoke track is).*$/, '') + warn;
    S.lf = lines.map(() => 0); S.lv = lines.map(() => 0); S.hit = lines.map(() => 0);
    buildLyrics(); labelTurns(); try { localStorage.removeItem('spd:' + pvid()); } catch (e) {} setScale(autoScale, false); anchors = []; nudgeBase = null; applyWarp(); force = true;
  } catch (e) { say('Could not switch lyrics: ' + e.message); }
};
async function runSong() {
  fixPend = null; nudgeBase = null; clearTimeout(fixTimer);      // forget the pending nudge of the previous song
  $('#home').style.display = 'none'; $('#stage').style.display = 'block'; $('#rate').style.display = 'none'; document.body.classList.add('instage');
  $('#now').textContent = whoTxt(current) + (current.singer2 ? ' are singing' : ' is singing') + ': ' + current.song.title + (current.mode && current.mode !== 'solo' ? ' (' + modeName[current.mode] + ')' : ''); $('#liveScore').textContent = '0';
  const box = $('#lyrics'); box.textContent = '';
  let anyRom = false, anyHan = false;
  lines.forEach((l, i) => {
    const d = el('div', null, 'ln'); d.id = 'l' + i; d.appendChild(el('span', l.text, 'o'));
    const rom = romanize(l.text); if (rom) { anyRom = true; d.classList.add('hasr'); d.appendChild(el('span', rom, 'r')); }
    if (/[\u4E00-\u9FFF]/.test(l.text)) anyHan = true;
    box.appendChild(d);
  });
  if (!lines.length) box.appendChild(el('div', '♪ Synced lyrics aren’t available for this song right now. It still plays: sing along with the video. ♪', 'nolyr'));
  box.className = 'm-' + $('#romMode').value; $('#romNote').style.display = anyRom || anyHan ? 'block' : 'none'; upgradeRomaji(lines);
  box.scrollTop = 0; frames = 0; active = true; drawMeter(0, 0); renderNow();
  labelTurns(); fxStart();
  S = newStats(lines);
  let saved = 0; try { saved = parseFloat(localStorage.getItem('off:' + pvid())) || 0; } catch (e) {}
  let sv = NaN; try { sv = parseFloat(localStorage.getItem('spd:' + pvid())); } catch (e) {}
  let shared = null;      // a timing fix someone already made for this exact track beats a guess
  try { const r = await Promise.race([fetch('/api/timing?' + new URLSearchParams({ v: pvid(), l: lyricId || '' })), new Promise((_, no) => setTimeout(no, 1500))]); shared = (await r.json()).timing || null; } catch (e) {}
  let sa = []; try { sa = JSON.parse(localStorage.getItem('anc:' + pvid()) || '[]'); } catch (e) {}
  if (shared) { saved = shared.o; sv = shared.s; sa = shared.a || []; }
  anchors = cleanAnchors(sa); applyWarp();
  setOffset(saved, false);
  if (shared) $('#markHint').textContent = 'Using the lyric timing that was already fixed for this track (' + (anchors.length ? anchors.length + ' sync point' + (anchors.length > 1 ? 's' : '') : 'shift ' + saved.toFixed(1) + 's') + ').' + (isSinger() ? ' Nudge it with Sooner / Later or Mark if it is still off; the fix is kept for everyone.' : '');
  else if (current.song.kv) $('#markHint').textContent = 'First time with this karaoke track: if the lyrics are early or late, press [ or ] to nudge them into line (Shift = bigger steps) and wait 4 seconds: that becomes a sync point. Do it again after any long instrumental break and near the end, and the lyrics follow the whole track. Saved for everyone.';
  else if (Math.abs(saved) >= 2) $('#markHint').textContent = 'This song still has a saved timing shift of ' + saved.toFixed(1) + 's from an earlier try. Press Reset timing if the lyrics do not match.';
  setScale(isNaN(sv) ? autoScale : sv, false); loadVersions();
  if (lines.length && lines[0].t0 > 3 && lines[0].t * scale - offset - tweak() < 1)      // a saved / shared fix makes line 1 start at once: say so instead of silently lighting it
    $('#markHint').textContent = 'Heads up: the saved timing for this track starts the first lyric line immediately, although the lyrics file puts it at ' + fmt(lines[0].t0) + '. That is usually an old or wrong shift. Press Reset timing, then nudge with [ ] if needed.';

  an = null; document.body.classList.toggle('aud', room.on && !isSinger());
  if (room.on && !isSinger()) {
    $('#micNote').textContent = 'Listening to ' + current.singer + ' sing live. Adjust their voice below.'; hookRemote();
  } else try {
    const mid = $('#micSel').value;
    stream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign(micC(), mid ? { deviceId: { exact: mid } } : {}) });
    actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume().catch(() => {}); vdest = null;
    an = actx.createAnalyser(); an.fftSize = 2048; micGain = actx.createGain(); micGain.gain.value = prefs.sens;
    micSrc = actx.createMediaStreamSource(stream); micSrc.connect(micGain);
    if (window.AIScore) AIScore.start(actx, micSrc);   // optional on-device AI judge (js/ai-score.js); scoring works without it
    micSup = null; try { micSup = await makeSuppressor(actx, prefs.sup, prefs.thr); } catch (e) { micSup = null; }   // mic suppression (a straight pass-through unless set to Strong or Maximum)
    const mout = micSup ? (micGain.connect(micSup.in), micSup.out) : micGain; mout.connect(an);
    if (room.on) {   // what friends hear = your mic after the sensitivity gain, with a limiter so loud notes do not crackle
      const lim = actx.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 8; lim.ratio.value = 12; lim.attack.value = .003; lim.release.value = .2;
      vdest = actx.createMediaStreamDestination(); gate = actx.createGain(); gate.gain.value = current.mode === 'solo' ? 1 : 0; gateState = -1; mout.connect(lim); lim.connect(gate); gate.connect(vdest);
    }
    $('#micNote').textContent = 'Mic is on. Headphones keep the music out of your score.';
    if (room.on && stream) { rtc.stream = vdest ? vdest.stream : stream; connectPeers(); }
  } catch (e) { $('#micNote').textContent = 'No mic access, so there is no automatic score this round.'; }
  $('#micNote').textContent += warn;

  const wrap = $('#ytwrap'); wrap.textContent = '';
  const card = $('#ytcard'); card.classList.add('show');
  (matchMedia('(min-width:1000px)').matches ? $('#sideSlot').parentNode.insertBefore(card, $('#sideSlot')) : $('#ytslot').appendChild(card));
  await loadYT();
  if (player) { try { player.destroy(); } catch (e) {} }
  const holder = el('div'); holder.id = 'yt'; wrap.appendChild(holder);
  if (current.song.kv) {      // karaoke track: show a still cover (the original single's artwork) instead of the moving karaoke video; the audio still plays
    const cv = el('div', null, 'ytcover'); cv.style.backgroundImage = 'url("https://i.ytimg.com/vi/' + encodeURIComponent(current.song.videoId) + '/hqdefault.jpg")';
    cv.append(el('span', '🎤', 'em'), el('b', current.song.title), el('small', current.song.artist)); wrap.appendChild(cv);
  }
  // A song whose first line comes almost at once gives no time to get ready. Solo: count down first (rooms: the server lengthens the shared countdown).
  const cin = !room.on && lines.length && lines[0].t * scale - offset - tweak() < 5 ? Math.min(6, Math.max(3, Math.round(7 - (lines[0].t * scale - offset - tweak())))) : 0;
  const countIn = secs => {
    const cd = $('#cd'), num = $('#cdNum'), end = performance.now() + secs * 1000;
    $('#cdWho').textContent = 'Get ready: ' + current.song.title; num.textContent = secs; cd.classList.add('show');
    const iv = setInterval(() => {
      const ms = end - performance.now();
      if (!active) { clearInterval(iv); cd.classList.remove('show'); return; }
      if (ms <= 0) { clearInterval(iv); num.textContent = '🎤'; try { player.playVideo(); } catch (x) {} setTimeout(() => cd.classList.remove('show'), 700); }
      else num.textContent = Math.ceil(ms / 1000);
    }, 100);
  };
  player = new YT.Player('yt', { width: 200, height: 200, videoId: pvid(),
    playerVars: { autoplay: ((room.on && (room.startAt || room.prep)) || cin) ? 0 : 1, playsinline: 1, rel: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, origin: location.origin },
    events: {
      onReady: e => {
        try { e.target.setVolume(prefs.vol); } catch (x) {}
        if (cin) countIn(cin);
        else if (room.on && room.prep) {        // load the video silently now, so it starts the instant everyone is ready
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
  }, 8000 + cin * 1000 + (room.on && room.startAt ? Math.max(0, room.startAt - (Date.now() + room.skew)) : 0));

  const endT = () => lines[lines.length - 1].t * scale + 8, fb = new Float32Array(2048);
  const lineEnd = i => Math.min(lines[i + 1] ? lines[i + 1].t * scale : lines[i].t * scale + 4, lines[i].t * scale + 6);
  let last = -1, lastNx = -2, lvl = 0, peak = 0, pkT = 0, clr = 0, liveT = 0, clkT = 0;
  // Countdown in the lyrics area, so everyone knows when to come in: while the music is starting, before the first line, and after long instrumental breaks.
  const lyC = $('#lyCount'), lyN = $('#lyNum'), lyL = $('#lyLbl'), lyD = $('#lyDots'); let lyKey = '', everPlayed = false;
  const skipBtn = $('#skipIntro') || { style: {} }; let skShown = false;       // "Skip intro": offered to the singer while a long instrumental intro is playing
  skipBtn.onclick = () => {
    const raw = getT(), target = Math.max(0, lines[0].t * scale - offset - tweak() - 4), d = target - raw;   // land 4 s before the first line
    if (!(d >= 2)) return; skipBtn.style.display = 'none';
    if (room.on) roomOp({ op: 'skipintro', delta: +d.toFixed(2) });                                          // the room clock moves forward, every video follows
    else try { player.seekTo(target, true); } catch (e) {}
  };
  const lyShow = (n, label) => {      // n = whole seconds left (0 = just show the message), label '' = hide
    const key = label ? n + '|' + label : ''; if (key === lyKey) return; lyKey = key;
    if (!label) { lyC.classList.remove('show'); return; }
    lyC.style.height = $('#lyrics').clientHeight + 'px'; lyL.textContent = label; lyN.textContent = n || ''; lyD.textContent = '';
    for (let k = 0; k < Math.min(3, n); k++) lyD.appendChild(el('i'));
    lyC.classList.toggle('wait', !n); lyC.classList.remove('show'); void lyC.offsetWidth; lyC.classList.add('show');   // restart the pop animation for every new number
  };
  const tick = now => {
    if (!active) { lyShow(0, ''); skipBtn.style.display = 'none'; skShown = false; return; }
    const playing = isPlay(), t = playing ? getT() + offset + tweak() : -1;
    if (playing && current.song.bpm) { const ph = (((getT() - (current.song.lead || 0)) * current.song.bpm / 60) % 1 + 1) % 1; fxVar('--beat', Math.pow(1 - ph, 3), .05); }
    let idx = -1; for (let i = 0; i < lines.length; i++) if (lines[i].t * scale <= t) idx = i;
    gateTurns(t);
    if (now - clkT > 250) {
      clkT = now; const raw = playing ? getT() : 0, first = lines[0].t * scale - offset - tweak();
      { const sk = playing && idx < 0 && isSinger() && first - raw > 12; if (sk !== skShown) { skShown = sk; skipBtn.style.display = sk ? '' : 'none'; } }
      const pr = $('#prog'); if (pr && playDur()) pr.style.width = Math.min(100, raw / playDur() * 100) + '%';
      $('#clock').textContent = !playing ? 'Waiting for the music to start…'
        : idx < 0 ? 'Song time ' + fmt(raw) + ' · first lyric line at ' + fmt(Math.max(0, first)) + ' (in ' + Math.max(0, Math.round(first - raw)) + 's)'
        : 'Song time ' + fmt(raw) + ' · line ' + (idx + 1) + ' of ' + lines.length;
    }
    if (idx >= 0 && playing) { const a = lines[idx].t * scale, gap = lineEnd(idx) - a, est = Math.min(gap * 0.95, Math.max(1, (lines[idx].text || '').length * 0.14)), p = Math.max(0, Math.min(1, (t - a) / Math.max(0.5, est))); const n = $('#l' + idx), pv = Math.round(p * 200) / 2; if (n) fillLine(n, pv); }
    { let cn = 0, cl = '';
      if (!playing) { const toGo = room.on && room.startAt ? room.startAt - (Date.now() + room.skew) : 0; if (toGo > 0 && toGo <= 9000) { cn = Math.ceil(toGo / 1000); cl = 'Song starts in'; } else cl = everPlayed ? 'Waiting for the music…' : 'Song starting…'; }
      else { everPlayed = true; const nx = lines[idx + 1];
        if (nx) { const left = nx.t * scale - t; if (left > 0 && left <= 3 && (idx < 0 || nx.t * scale - lines[idx].t * scale >= 9)) { cn = Math.ceil(left); cl = idx < 0 ? 'First line in' : 'Next line in'; } } }
      lyShow(cn, cl); }
    // The upcoming line is only lit once it is really close: before the music runs, or while the first line is more than 5 s away,
    // line 1 stays dim like the rest (it used to glow white at once, which looked like it was already being sung).
    const nxt = idx >= 0 ? idx + 1 : (playing && lines[0].t * scale - t <= 5 ? 0 : -1);
    if (idx !== last || nxt !== lastNx || force) { force = false;
      last = idx; lastNx = nxt;
      lines.forEach((_, i) => { const e = document.getElementById('l' + i); e.classList.toggle('now', i === idx); e.classList.toggle('past', i < idx); e.classList.toggle('next', i === nxt); });
      const d = $('#l' + Math.max(idx, 0)); box.scrollTo({ top: d.offsetTop - box.clientHeight / 2 + d.offsetHeight / 2, behavior: prefs.calm ? 'auto' : 'smooth' });
    }
    if (an && playing) {
      an.getFloatTimeDomainData(fb); let s = 0, mx = 0, dc = 0;
      for (let i = 0; i < fb.length; i++) { const v = fb[i]; dc += v; const a = Math.abs(v); if (a > mx) mx = a; }
      dc /= fb.length; for (let i = 0; i < fb.length; i++) { const v = fb[i] - dc; s += v * v; }                  // level without the mic's DC offset
      const rms = Math.sqrt(s / fb.length);
      lvl = Math.max(Math.min(1, rms * 5), lvl * .86);
      if (lvl >= peak) { peak = lvl; pkT = now; } else if (now - pkT > 600) peak = Math.max(lvl, peak - .02);
      drawMeter(lvl, peak);
      const fresh = ++frames % 2 === 0; if (fresh) clr = clarity(fb, actx.sampleRate);
      // Fair scoring: judge the voice itself, not how loud the mic is set. The Mic level slider is divided back out, and "singing" is
      // measured against this mic's own background noise (learned in the first second and tracked while you are quiet).
      const g = (micGain && micGain.gain.value) || 1, rr = rms / g, rmx = mx / g;
      if (S.nfN < 45) { S.nf = S.nfN ? Math.min(S.nf, rr) : rr; S.nfN++; }
      const thr = Math.min(.045, Math.max(.008, S.nf * 3));
      if (rr <= thr && S.nfN >= 45) S.nf += (rr - S.nf) * .03;
      const ai = window.AIScore ? AIScore.read() : null;                              // null until the AI model has loaded (or if it cannot)
      const voiced = rr > thr && clr > .5 && (!ai || ai.sing >= .2);                  // above the noise, a real pitch, and (with AI) it hears singing
      const mine = idx >= 0 && t < lineEnd(idx) && ownLine(idx);
      if (voiced && (idx < 0 || ownLine(idx))) {
        const d = 20 * Math.log10(Math.max(rr, 1e-4)); S.voiced++; S.rms += rr; S.db += d; S.db2 += d * d; if (clr > .8) S.clear++; if (rmx > .95) S.clip++;
        if (clr > .8 && clarity.hz) {
          const st = 12 * Math.log2(clarity.hz / 440); S.pn++; S.ps += st; S.ps2 += st * st;
          if (fresh) { S.run = Math.abs(st - S.lastSt) < .25 ? S.run + 1 : 0; S.lastSt = st; if (S.run >= 4) { S.hist[Math.floor((((st % 1) + 1) % 1) * 100) % 100]++; S.sn++; } }   // a held note: where does it sit on the scale?
        }
      } else if (fresh) S.run = 0;
      if (ai && mine) { S.ai++; if (ai.sing >= .2) S.aiS++; }                         // how much of your own lines the AI heard as singing
      if (!mine) { S.gf++; if (voiced) S.gv++; }                                      // sound during breaks / a partner's lines = noise or music leaking in
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
  cancelAnimationFrame(raf); stopMedia(); $('#ytcard').classList.remove('show'); drawMeter(0, 0); fxVar.reset('--beat');
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (window.AIScore) AIScore.stop();
  if (actx) actx.close();
  const hasMic = !!an && S.voiced > 0, parts = compute(lines.length), pts = hasMic ? total(parts) : 0;
  if (hasMic && current && current.song) { try { Mine.played(current.song, pts); } catch (e) {} }   // My songs > History (this device only)
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
$('#back').onclick = () => { refreshTheme(); document.body.classList.remove('aud', 'instage'); $('#stage').style.display = 'none'; $('#home').style.display = 'block'; say('Pick the next song when you’re ready.'); };

function renderScores() {
  const box = $('#sideScores'); box.textContent = '';
  const names = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  if (!names.length) { box.appendChild(el('p', 'No scores yet.', 'note')); return; }
  names.forEach(n => { const r = el('div', null, 'sc'); r.append(el('span', avTxt(n) + n), el('b', scores[n] + ' pts')); box.appendChild(r); });
}

