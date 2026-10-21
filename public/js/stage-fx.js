// ---- stage look: themes, bouncing lyrics, dimming lights, singer avatars, crowd energy, combo, confetti
const THEMES = { neon: 'Neon club', arcade: 'Retro arcade', stars: 'Starry sky', xmas: 'Christmas', spooky: 'Spooky night', sunset: 'Sunset drive', aurora: 'Aurora', jazz: 'Jazz lounge' };
{ const bg = $('.bg'); ['arcade', 'stars', 'sunset', 'aurora', 'jazz', 'spooky', 'xmas', 'xlights'].forEach(k => bg.appendChild(el('b', null, 'th th-' + k))); bg.after(el('div', null, 'bgdim')); }
if (!THEMES[prefs.theme]) prefs.theme = 'neon';      // older saved settings said "song's choice"; there is now one overall theme
const themeFor = () => THEMES[prefs.theme] ? prefs.theme : 'neon';
function applyTheme(t) { document.body.dataset.theme = THEMES[t] ? t : 'neon'; renderThemeRow(); }
function refreshTheme() { applyTheme(themeFor()); }
function renderThemeRow() { document.querySelectorAll('#lTheme button[data-th]').forEach(b => { const on = b.dataset.th === prefs.theme; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
document.querySelectorAll('#lTheme button[data-th]').forEach(b => b.onclick = () => { prefs.theme = b.dataset.th; applyPrefs(); });   // home page: changes the whole site

const fx = { bn: 0, lights: 1, lastIdx: -1, lastBeat: -1, prev: 0, lastB: 0, vl: 0, t: 0 };
const crowd = { e: 0, txt: '' }; let fxStats = { reacts: 0 };
const cb = { n: 0, max: 0, last: -1 };
const hashAv = n => { const h = [...n].reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 7) >>> 0; return { e: EMOJI[h % EMOJI.length], c: COLORS[(h >> 4) % COLORS.length] }; };
const avFor = n => avOf(n) || hashAv(n);
function avBuild() {
  const box = $('#avStage'); box.textContent = ''; if (!current) return;
  singersOf(current).forEach(n => {
    const a = avFor(n), d = el('div', null, 'avs'), big = el('div', null, 'big');
    big.style.background = a.c; big.style.setProperty('--ac', a.c); big.appendChild(el('span', a.e, 'em')); d.append(big, el('div', n, 'nm')); box.appendChild(d);
  });
}
function avUpdate(idx, playing) {
  const nodes = [...$('#avStage').children]; if (!nodes.length) return;
  const turns = current && current.turns, v = turns && idx >= 0 ? turns[idx] : -1;
  nodes.forEach((n, k) => { const on = !!playing && (turns ? idx >= 0 && (v === TOGETHER || v === k) : true); n.classList.toggle('on', on); if (on) { const vq = fx.vl.toFixed(1); if (n._vl !== vq) { n._vl = vq; n.style.setProperty('--vl', vq); } } else if (n._vl != null) { n._vl = null; n.style.removeProperty('--vl'); } });
}
function crowdBuild() {
  const box = $('#crowd'); if (!box) return; box.textContent = ''; if (!room.on || !current) return;
  room.peers.filter(p => !(current.sids || []).includes(p.id) && !p.away).forEach(p => {
    const a = p.av || { e: '🎤', c: '#888' }, d = el('div', a.e, 'cav'); d.style.background = a.c; d.dataset.name = p.name; d.title = p.name; box.appendChild(d);
  });
}
const crowdTxt = e => e < 20 ? 'Quiet' : e < 45 ? 'Warming up' : e < 70 ? 'Hype!' : 'ON FIRE 🔥';
function fxReact() { crowd.e = Math.min(100, crowd.e + 12); fxStats.reacts++; }
function fxChat() { if (active) crowd.e = Math.min(100, crowd.e + 4); }
function setCombo(pop) {
  const c = $('#combo'); c.classList.toggle('on', cb.n >= 2); c.textContent = cb.n >= 12 ? '🔥🔥 ×' + cb.n + ' ON FIRE' : '🔥 Combo ×' + cb.n;
  if (pop) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
}
function comboEval(i) {             // line i is over: did I sing it?
  if (!ownLine(i) || !S || (S.lf[i] || 0) < 6) return;
  if (S.lv[i] / S.lf[i] >= .5) { cb.n++; cb.max = Math.max(cb.max, cb.n); setCombo(true); }
  else { cb.n = 0; setCombo(); }
}
function comboTick(idx) { while (cb.last < idx - 1) comboEval(++cb.last); }
function comboFinish() { while (cb.last < lines.length - 1) comboEval(++cb.last); return { max: cb.max, bonus: Math.min(10, Math.round(cb.max * .8)) }; }
function fxStart() {
  applyTheme(themeFor()); Object.assign(fx, { bn: 0, lights: 1, lastIdx: -1, lastBeat: -1, prev: 0, vl: 0, t: 0 });
  Object.assign(cb, { n: 0, max: 0, last: -1 }); setCombo(); crowd.e = 0; fxStats = { reacts: 0 };
  avBuild(); crowdBuild(); fxVar.reset('--lights');
}
function fxTick(now, t, idx, playing, lvl) {
  const dt = Math.min(.1, (now - (fx.t || now)) / 1000); fx.t = now;
  crowd.e = Math.max(0, crowd.e - 5 * dt); const cw = Math.round(crowd.e); if (crowd._w !== cw) { crowd._w = cw; $('#crowdBar').style.width = cw + '%'; }
  const ct = crowdTxt(crowd.e); if (ct !== crowd.txt) { crowd.txt = ct; $('#crowdTxt').textContent = ct; }
  if (idx >= 0 && !(room.on && !isSinger()) && an) comboTick(idx);
  fx.vl += ((lvl >= 0 ? Math.min(1, lvl * 1.4) : 0) - fx.vl) * .3; avUpdate(idx, playing);
  if (prefs.calm) { if (fx.lights !== 1) { fx.lights = 1; fxVar.reset('--lights'); } return; }
  // bounce on strong beats: the song tempo when it is known, otherwise the loudest moments of the singing
  let hit = 0;
  if (playing && current.song.bpm) { const bt = (getT() - (current.song.lead || 0)) * current.song.bpm / 60, bi = Math.floor(bt); if (bt >= 0 && bi !== fx.lastBeat) { fx.lastBeat = bi; hit = bi % 4 === 0 ? 1 : .5; } }
  else if (lvl >= 0 && lvl - fx.prev > .16 && lvl > .25 && now - fx.lastB > 220) hit = Math.min(1, .5 + lvl);
  if (lvl >= 0) fx.prev = lvl;
  if (idx !== fx.lastIdx) { if (idx >= 0) hit = Math.max(hit, .6); fx.lastIdx = idx; }
  if (hit) { fx.bn = Math.max(fx.bn, hit); fx.lastB = now; }
  fx.bn *= .86; const n = idx >= 0 ? $('#l' + idx) : null; if (n) { const bv = fx.bn.toFixed(2); if (n._bn !== bv) { n._bn = bv; n.style.setProperty('--bn', bv); } }
  // stage lights dim in quiet moments: before the first line, instrumental gaps, and soft singing
  let target = 1;
  if (!playing) target = .75;
  else if (idx < 0) target = .45;
  else { const a = lines[idx].t * scale, endL = Math.min(lines[idx + 1] ? lines[idx + 1].t * scale : a + 4, a + 6); if (t > endL + 1.2) target = .4; else if (lvl >= 0) target = .65 + .35 * Math.min(1, lvl / .35); }
  fx.lights += (target - fx.lights) * .05; fxVar('--lights', fx.lights, .02);
}
function confetti(score) {
  if (prefs.calm) return; const lite = document.body.classList.contains('lite') ? .35 : 1, n = Math.round((score >= 95 ? 240 : score >= 85 ? 140 : score >= 70 ? 50 : 0) * lite); if (!n) return;
  const cols = ['#ff3d8b', '#35e0ff', '#ffc83d', '#a83dff', '#3be58a'];
  for (let i = 0; i < n; i++) {
    const c = el('i', null, 'cf'), s = 6 + Math.random() * 8; c.style.left = Math.random() * 100 + 'vw'; c.style.width = s + 'px'; c.style.height = s * 1.7 + 'px'; c.style.background = cols[i % cols.length];
    c.style.animationDuration = 2.2 + Math.random() * 2.6 + 's'; c.style.animationDelay = Math.random() * 1.2 + 's'; document.body.appendChild(c); setTimeout(() => c.remove(), 6500);
  }
  if (score >= 85) for (let k = 0; k < 2; k++) setTimeout(() => { for (let i = 0; i < 46; i++) {
    const c = el('i', null, 'cb'), a = Math.random() * Math.PI * 2, d = 180 + Math.random() * 380; c.style.background = cols[i % cols.length];
    c.style.setProperty('--dx', Math.cos(a) * d + 'px'); c.style.setProperty('--dy', Math.sin(a) * d + 150 + 'px'); c.style.setProperty('--r', Math.random() * 720 + 'deg');
    document.body.appendChild(c); setTimeout(() => c.remove(), 1900); } }, k * 500);
  if (score >= 95) ['🎆', '🎇', '✨', '🎆', '🎇'].forEach((e, i) => setTimeout(() => { const d = el('div', e, 'rx'); d.style.left = (10 + i * 18) + '%'; d.style.fontSize = '3.4rem'; $('#rxl').appendChild(d); setTimeout(() => d.remove(), 2700); }, i * 220));
}
renderThemeRow(); applyTheme(themeFor());
