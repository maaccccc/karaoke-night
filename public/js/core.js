const $ = s => document.querySelector(s);
const players = [], queue = [], scores = {};
let current = null, an = null, stream = null, actx = null, raf = 0, audio = null;
// Messages are pop-ups now (they slide in at the top for a few seconds) instead of one fixed line of text on the home page. say('') shows nothing.
const say = t => { t = String(t == null ? '' : t).trim(); if (t) popup(t); };
function popup(t) {
  let box = document.getElementById('joinToasts');
  if (!box) { box = document.createElement('div'); box.id = 'joinToasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  if ([...box.children].some(x => x.dataset.t === t)) return;                    // the same text is already showing
  while (box.children.length >= 4) box.firstChild.remove();
  const d = document.createElement('div'); d.className = 'jt jtmsg'; d.dataset.t = t; d.textContent = t;
  d.style.animationDuration = Math.min(10, 3.8 + t.length * .045) + 's';         // longer messages stay a little longer
  box.appendChild(d); d.addEventListener('animationend', () => d.remove());
}
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
const _fvOnly = { '--lights': ['bg', 'bgdim'] };   // variables only the background layers read are set on those layers, so a change does not restyle every element on the page
const _fvEls = name => { const c = _fvOnly[name]; if (!c) return [document.body]; const o = []; c.forEach(k => { for (const e of document.getElementsByClassName(k)) o.push(e); }); return o; };
function fxVar(name, v, step) { if (document.body.classList.contains('lite')) return; const q = Math.round(v / step) * step; if (_fv[name] !== q) { _fv[name] = q; const s = q.toFixed(2); _fvEls(name).forEach(e => e.style.setProperty(name, s)); } }
fxVar.reset = name => { delete _fv[name]; _fvEls(name).forEach(e => e.style.removeProperty(name)); };
