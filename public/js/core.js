const $ = s => document.querySelector(s);
const players = [], queue = [], scores = {};
let current = null, an = null, stream = null, actx = null, raf = 0, audio = null;
const say = t => $('#msg').textContent = t;
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fmt = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

for (let i = 0; i < 7; i++) { const b = el('i'); b.style.setProperty('--d', i); $('#eq').appendChild(b); }
const segs = []; for (let i = 0; i < 24; i++) { const s = el('i'); if (i >= 16) s.className = i >= 21 ? 'r' : 'y'; $('#vu').appendChild(s); segs.push(s); }
function drawMeter(lvl, peak) {
  const n = Math.round(lvl * 24), pk = Math.min(23, Math.round(peak * 24));
  segs.forEach((s, i) => { s.classList.toggle('on', i < n); s.classList.toggle('pk', i === pk && pk >= n && pk > 0); });
}

// ---- singers
function renderPlayers() { const box = $('#plist'); box.textContent = ''; players.forEach(p => box.appendChild(el('span', p, 'chip'))); }
function addPlayer() {
  const n = $('#pname').value.trim(); if (!n || players.includes(n)) return;
  players.push(n); scores[n] = scores[n] || 0; $('#pname').value = ''; renderPlayers(); renderScores();
}
$('#addP').onclick = addPlayer;
$('#pname').onkeydown = e => { if (e.key === 'Enter') addPlayer(); };

// ---- audio devices
function fillSel(sel, list, def) {
  const keep = sel.value; sel.textContent = '';
  const o = el('option', def); o.value = ''; sel.appendChild(o);
  list.forEach((d, i) => { if (!d.deviceId || d.deviceId === 'default') return; const op = el('option', d.label || 'Device ' + (i + 1)); op.value = d.deviceId; sel.appendChild(op); });
  sel.value = keep;
}
async function loadDevices(ask) {
  try {
    if (ask) { const t = await navigator.mediaDevices.getUserMedia({ audio: true }); t.getTracks().forEach(x => x.stop()); }
    const ds = await navigator.mediaDevices.enumerateDevices();
    fillSel($('#micSel'), ds.filter(d => d.kind === 'audioinput'), 'Default microphone');
    fillSel($('#tSel'), ds.filter(d => d.kind === 'audioinput'), 'Default microphone'); $('#tSel').value = $('#micSel').value;
    fillSel($('#outSel'), ds.filter(d => d.kind === 'audiooutput'), 'Default speakers');
    fillSel($('#tOut'), ds.filter(d => d.kind === 'audiooutput'), 'Default speakers'); $('#tOut').value = $('#outSel').value;
    say('Devices updated.');
  } catch (e) { say('Could not read audio devices: ' + e.message); }
}
$('#devBtn').onclick = () => loadDevices(true);

/*ROM_START*/

// Writing a CSS variable on <body> restyles the whole page, so do it only when the value really changed (and never in lite mode).
const _fv = {};
function fxVar(name, v, step) { if (document.body.classList.contains('lite')) return; const q = Math.round(v / step) * step; if (_fv[name] !== q) { _fv[name] = q; document.body.style.setProperty(name, q.toFixed(2)); } }
fxVar.reset = name => { delete _fv[name]; document.body.style.removeProperty(name); };
