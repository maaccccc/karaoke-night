// ---- lyrics + YouTube
function parseLrc(lrc) {
  const out = [];
  lrc.split('\n').forEach(line => {
    const m = line.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m && m[3].trim()) out.push({ t: +m[1] * 60 + parseFloat(m[2]), text: m[3].trim() });
  });
  return out.sort((a, b) => a.t - b.t);
}
let ytReady = null, player = null;
function loadYT() {
  if (!ytReady) ytReady = new Promise(res => {
    if (window.YT && YT.Player) return res();
    window.onYouTubeIframeAPIReady = res;
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  });
  return ytReady;
}

// ---- automatic scoring (out of 100)
// Fair to quiet or cheap mics, hard on mics that only hear the song. A frame counts as singing when it is above this mic's own noise floor,
// above the level of the song leaking in from the speakers (measured in the instrumental breaks), and has a real musical pitch.
// A mic that "sings" just as much in the breaks as on the lines is echoing the music, and its score is cut (see echoLevel).
const MAXP = { Singing: 45, Tone: 25, Volume: 15, Timing: 15 };
let S = null;
// Fresh per-song scoring stats. singing.js calls this at the start of every song.
function newStats(ls) {
  return { voiced: 0, rms: 0, db: 0, db2: 0, nf: 0, nfN: 0, pn: 0, ps: 0, ps2: 0, gf: 0, gv: 0, clear: 0, clip: 0,
    lf: ls.map(() => 0), lv: ls.map(() => 0), hit: ls.map(() => 0),
    gb: [], bg: 0, vh: 0, run: 0, lt: 0, lb: 0, gdb: 0, gdn: 0, echoWarn: false,
    lastSt: 0, hist: new Array(100).fill(0), sn: 0, ai: 0, aiS: 0 };
}
const clamp01 = x => Math.max(0, Math.min(1, x));
function echoLevel() {      // 0 = clean, 1 = the mic is clearly just replaying the music
  if (!S || S.gf < 60 || S.lt < 60) return 0;                                  // need about a second of clear break and of own lines to judge
  const gapShare = S.gv / S.gf, lineShare = S.lb / S.lt, ratio = gapShare / Math.max(lineShare, .05);   // how much of the breaks "sounds like singing" compared with the lines
  const gl = S.gdn ? S.gdb / S.gdn : -100, ll = S.voiced ? S.db / S.voiced : -100;                       // a real singer is much louder on the lines than in a break
  return clamp01((gapShare - .25) / .3) * clamp01((ratio - .5) / .35) * (1 - .6 * clamp01((ll - gl - 3) / 9));
}
function compute(n) {
  n = Math.max(1, Math.min(n, lines.length)); let cov = 0, hits = 0, m = 0;
  for (let i = 0; i < n; i++) { if (!ownLine(i)) continue; m++; cov += S.lf[i] ? clamp01(S.lv[i] / (S.lf[i] * .7)) : 0; hits += S.hit[i]; }
  const v = S.voiced;
  if (!v) return { Singing: 0, Tone: 0, Volume: 0, Timing: 0 };
  const echo = echoLevel(), leak = 1 - .85 * echo, soft = 1 - .6 * echo;
  const mean = S.db / v, sd = Math.sqrt(Math.max(0, S.db2 / v - mean * mean));
  const nfDb = 20 * Math.log10(Math.max(.0005, Math.min(S.nf || .002, .03)));
  const bgDb = S.bg > 0 ? 20 * Math.log10(Math.max(S.bg, .0005)) : -100, refDb = Math.max(nfDb, bgDb);   // what you must stand out from: room noise or the song in the mic
  const proj = clamp01((mean - refDb - 6) / 16), steady = 1 - clamp01((sd - 5) / 7);                         // stands out from the background; steady level
  const pm = S.pn > 20 ? Math.sqrt(Math.max(0, S.ps2 / S.pn - (S.ps / S.pn) ** 2)) : 0;                 // how far the pitch travels (semitones): a drone or hum does not
  return {
    Singing: cov / Math.max(1, m) * 45 * leak * (.6 + .4 * clamp01(pm / 2)),                                // a flat hum is not singing either
    Tone: clamp01((S.clear / v - .3) / .55) * (.4 + .6 * clamp01(pm / 2)) * 25 * soft,
    Volume: (.6 * proj + .4 * steady) * (1 - Math.min(.5, S.clip / v * 2)) * 15 * soft,
    Timing: hits / Math.max(1, m) * 15 * leak
  };
}
const total = p => Math.round(Object.values(p).reduce((a, b) => a + b, 0));
function clarity(buf, sr) {   // how clearly ONE musical pitch is present (0 to 1); the pitch itself is left in clarity.hz
  const n = buf.length; let mean = 0; for (let i = 0; i < n; i++) mean += buf[i]; mean /= n;        // a cheap mic's DC offset is not a note
  let e = 0; for (let i = 0; i < n; i++) { const x = buf[i] - mean; e += x * x; }
  clarity.hz = 0; if (e < 1e-3) return 0;
  const lo = Math.max(2, Math.floor(sr / 900) - 2), hi = Math.min(Math.floor(sr / 80), n >> 1) + 2, r = [];
  for (let lag = lo; lag <= hi; lag += 2) {
    let c = 0; for (let i = 0; i < n - lag; i += 2) c += (buf[i] - mean) * (buf[i + lag] - mean);
    r.push(c / (e * (n - lag) / (2 * n)));
  }
  let best = 0, bl = 0;
  for (let k = 1; k < r.length - 1; k++) if (r[k] > r[k - 1] && r[k] >= r[k + 1] && r[k] > best) best = r[k];   // a true peak, not low-frequency leakage at the edge
  for (let k = 1; k < r.length - 1; k++) if (r[k] > r[k - 1] && r[k] >= r[k + 1] && r[k] >= best * .9) { bl = lo + k * 2; break; }   // the first strong peak = the real pitch, not an octave below
  if (bl) clarity.hz = sr / bl;
  return Math.min(1, best);
}
