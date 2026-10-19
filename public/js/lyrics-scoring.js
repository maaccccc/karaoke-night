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
const MAXP = { Singing: 45, Tone: 25, Volume: 15, Timing: 15 };
let S = null;
function compute(n) {
  n = Math.max(1, Math.min(n, lines.length)); let cov = 0, hits = 0, m = 0;
  for (let i = 0; i < n; i++) { if (!ownLine(i)) continue; m++; cov += S.lf[i] ? Math.min(1, S.lv[i] / (S.lf[i] * .6)) : 0; hits += S.hit[i]; }
  const v = S.voiced;
  if (!v) return { Singing: 0, Tone: 0, Volume: 0, Timing: 0 };
  return {
    Singing: cov / Math.max(1, m) * 45,
    Tone: Math.min(1, S.clear / v / .7) * 25,
    Volume: Math.min(1, S.rms / v / .06) * (1 - Math.min(.5, S.clip / v * 2)) * 15,
    Timing: hits / Math.max(1, m) * 15
  };
}
const total = p => Math.round(Object.values(p).reduce((a, b) => a + b, 0));
function clarity(buf, sr) {   // how clearly a single pitch is present (0 to 1)
  let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
  if (e < 1e-3) return 0;
  const lo = Math.floor(sr / 900), hi = Math.min(Math.floor(sr / 80), buf.length >> 1); let best = 0;
  for (let lag = lo; lag < hi; lag += 2) { let c = 0; for (let i = 0; i < buf.length - lag; i += 2) c += buf[i] * buf[i + lag]; if (c > best) best = c; }
  return best / (e / 2);
}

