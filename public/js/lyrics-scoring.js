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
// A cheap or noisy mic must not be able to "sing" a perfect score. So a frame only counts as singing when it is clearly above this mic's own
// noise AND has a real musical pitch (hiss, rumble, DC offset and fans have none), and the score also looks at WHEN there is sound:
// sound that keeps going through instrumental breaks or a duet partner's lines is noise or backing music leaking into the mic, not singing.
const MAXP = { Singing: 45, Tone: 25, Volume: 15, Timing: 15 };
let S = null;
const clamp01 = x => Math.max(0, Math.min(1, x));
function compute(n) {
  n = Math.max(1, Math.min(n, lines.length)); let cov = 0, hits = 0, m = 0;
  for (let i = 0; i < n; i++) { if (!ownLine(i)) continue; m++; cov += S.lf[i] ? clamp01(S.lv[i] / (S.lf[i] * .75)) : 0; hits += S.hit[i]; }
  const v = S.voiced;
  if (!v) return { Singing: 0, Tone: 0, Volume: 0, Timing: 0 };
  const gapR = S.gf >= 120 ? S.gv / S.gf : 0, gapPen = 1 - .7 * clamp01((gapR - .35) / .4);          // constant sound through the breaks = not singing
  const mean = S.db / v, sd = Math.sqrt(Math.max(0, S.db2 / v - mean * mean));
  const nfDb = 20 * Math.log10(Math.max(.0005, Math.min(S.nf || .002, .03)));
  const proj = clamp01((mean - nfDb - 10) / 20), steady = 1 - clamp01((sd - 5) / 7);                  // stands out from the room noise; steady level
  const pm = S.pn > 20 ? Math.sqrt(Math.max(0, S.ps2 / S.pn - (S.ps / S.pn) ** 2)) : 0;                 // how far the pitch travels (semitones): a drone or hum does not
  return {
    Singing: cov / Math.max(1, m) * 45 * gapPen * (.6 + .4 * clamp01(pm / 2)),                              // a flat hum is not singing either
    Tone: clamp01((S.clear / v - .3) / .55) * (.4 + .6 * clamp01(pm / 2)) * 25,
    Volume: (.6 * proj + .4 * steady) * (1 - Math.min(.5, S.clip / v * 2)) * 15,
    Timing: hits / Math.max(1, m) * 15 * gapPen
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
