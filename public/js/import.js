// ---- import songs from your computer
const lib = [];
function guessFromName(n) {
  const s = n.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\s*\d{1,3}[\s.\-)]+/, '').trim();
  const m = s.split(/\s+[-–—]\s+/);
  return m.length >= 2 ? { artist: m[0].trim(), title: m.slice(1).join(' - ').trim() } : { artist: '', title: s };
}
async function readTags(file) {      // minimal ID3v2 reader for title and artist
  try {
    const h = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (String.fromCharCode(h[0], h[1], h[2]) !== 'ID3') return {};
    const size = (h[6] << 21) | (h[7] << 14) | (h[8] << 7) | h[9], ver = h[3];
    const b = new Uint8Array(await file.slice(10, 10 + Math.min(size, 300000)).arrayBuffer()), out = {};
    let p = 0;
    while (p + 10 <= b.length) {
      const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4 ? (b[p + 4] << 21) | (b[p + 5] << 14) | (b[p + 6] << 7) | b[p + 7] : b[p + 4] * 16777216 + (b[p + 5] << 16) + (b[p + 6] << 8) + b[p + 7];
      if (fs <= 0 || p + 10 + fs > b.length) break;
      if (id === 'TIT2' || id === 'TPE1') {
        const f = b.subarray(p + 10, p + 10 + fs), enc = [ 'iso-8859-1', 'utf-16', 'utf-16be', 'utf-8' ][f[0]] || 'utf-8';
        out[id] = new TextDecoder(enc).decode(f.subarray(1)).replace(/\0/g, '').trim();
      }
      p += 10 + fs;
    }
    return { title: out.TIT2, artist: out.TPE1 };
  } catch (e) { return {}; }
}
async function analyze(file) {       // length, tempo (BPM) and where the music really starts
  const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
  const ab = await ctx.decodeAudioData(await file.arrayBuffer());
  const d = ab.getChannelData(0), hop = Math.floor(ab.sampleRate / 200), n = Math.min(Math.floor(d.length / hop), 18000);
  const env = new Float32Array(n); let mx = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < hop; j += 4) s += Math.abs(d[i * hop + j]); env[i] = s; if (s > mx) mx = s; }
  let lead = 0; while (lead < n && env[lead] < mx * .05) lead++;
  const on = new Float32Array(n); for (let i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
  let best = 0, bpm = 0;
  for (let b = 70; b <= 170; b += .5) {
    const lag = Math.round(12000 / b); let c = 0; for (let i = 0; i + lag < n; i++) c += on[i] * on[i + lag];
    c /= (n - lag); if (c > best) { best = c; bpm = b; }
  }
  return { duration: ab.duration, bpm: Math.round(bpm), lead: lead / 200 };
}
async function importFile(f) {
  const ent = { file: f, title: '', artist: '', duration: 0, bpm: 0, lead: 0, status: 'Analyzing…' };
  lib.push(ent); renderLib();
  const tags = await readTags(f), g = guessFromName(f.name);
  ent.title = tags.title || g.title; ent.artist = tags.artist || g.artist;
  try { Object.assign(ent, await analyze(f)); }
  catch (e) { ent.status = 'Could not read this file. Try an MP3, WAV, M4A, or OGG.'; renderLib(); return; }
  await checkLyrics(ent);
}
async function checkLyrics(ent) {
  ent.status = 'Finding lyrics…'; renderLib();
  try {
    const r = await fetch('/api/lyrics?' + new URLSearchParams({ title: ent.title, artist: ent.artist, duration: ent.duration }));
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    const n = parseLrc(d.lrc).length;
    ent.status = n ? 'Timed lyrics found (' + n + ' lines)' : 'No timed lyrics found. Fix the title or artist, then re-check.';
  } catch (e) { ent.status = 'Lyrics lookup failed: ' + e.message; }
  renderLib();
}
async function alignEntry(ent) {       // the server listens to the song and times each lyric line
  try {
    let texts;
    if ((ent.pasted || '').trim()) texts = ent.pasted.split('\n').map(x => x.trim()).filter(Boolean);
    else {
      ent.status = 'Getting the lyrics text…'; renderLib();
      const r0 = await fetch('/api/lyrics?' + new URLSearchParams({ title: ent.title, artist: ent.artist, duration: ent.duration }));
      const d0 = await r0.json(); if (!r0.ok) throw new Error(d0.error);
      texts = parseLrc(d0.lrc).map(l => l.text);
    }
    if (!texts.length) throw new Error('no lyrics to align. Paste them in the box.');
    const job = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ent.status = 'Uploading the audio…'; renderLib();
    const ext = (ent.file.name.split('.').pop() || 'mp3').slice(0, 5);
    let r = await fetch('/api/align/upload?job=' + job + '&ext=' + encodeURIComponent(ext), { method: 'POST', body: ent.file });
    let d = await r.json(); if (!r.ok) throw new Error(d.error);
    r = await fetch('/api/align/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job, lines: texts }) });
    d = await r.json(); if (!r.ok) throw new Error(d.error);
    for (;;) {
      await new Promise(res => setTimeout(res, 2000));
      const st = await (await fetch('/api/align/status?job=' + job)).json();
      if (st.state === 'done') { ent.aligned = { lines: texts, times: st.times }; ent.status = 'Aligned from the audio (' + texts.length + ' lines)'; break; }
      if (st.state === 'error' || st.state === 'unknown') throw new Error(st.message);
      ent.status = st.message || 'Working…'; renderLib();
    }
  } catch (e) { ent.status = 'Auto-align failed: ' + e.message; }
  renderLib();
}
function renderLib() {
  const box = $('#lib'); box.textContent = '';
  lib.forEach((ent, i) => {
    const row = el('div', null, 'item'), info = el('div'); info.style.flex = '1 1 260px';
    const t = el('input'); t.type = 'text'; t.value = ent.title; t.placeholder = 'Title'; t.setAttribute('aria-label', 'Title'); t.oninput = () => ent.title = t.value;
    const a = el('input'); a.type = 'text'; a.value = ent.artist; a.placeholder = 'Artist'; a.setAttribute('aria-label', 'Artist'); a.oninput = () => ent.artist = a.value;
    const meta = ent.duration ? fmt(ent.duration) + ' · ' + (ent.bpm ? ent.bpm + ' BPM · ' : '') : '';
    const ir = el('div', null, 'row'); ir.append(t, a);
    info.append(ir, el('small', meta + ent.status));
    const det = el('details'); det.appendChild(el('summary', 'Paste your own lyrics (optional)'));
    const ta = el('textarea'); ta.rows = 4; ta.value = ent.pasted || ''; ta.oninput = () => ent.pasted = ta.value; det.appendChild(ta); info.appendChild(det);
    const sel = el('select'); sel.setAttribute('aria-label', 'Singer');
    (players.length ? players : ['Anyone']).forEach(p => sel.appendChild(el('option', p)));
    const re = el('button', 'Re-check lyrics', 'ghost'); re.onclick = () => checkLyrics(ent);
    const al = el('button', 'Auto-align lyrics', 'ghost'); al.onclick = () => alignEntry(ent);
    const add = el('button', 'Add to queue');
    add.onclick = () => {
      if (!ent.duration) return;
      queue.push({ song: { videoId: 'local:' + ent.file.name + ent.file.size, title: ent.title || ent.file.name, artist: ent.artist, duration: ent.duration, bpm: ent.bpm, lead: ent.lead, aligned: ent.aligned }, singer: sel.value, file: ent.file });
      renderQueue(); say('Queued: ' + (ent.title || ent.file.name));
    };
    const rm = el('button', 'Remove', 'ghost'); rm.onclick = () => { lib.splice(i, 1); renderLib(); };
    row.append(info, sel, re, al, add, rm); box.appendChild(row);
  });
}
$('#imp').onchange = async e => { for (const f of [...e.target.files]) await importFile(f); e.target.value = ''; };
try { $('#romMode').value = localStorage.getItem('romMode') || 'both'; } catch (e) {}
$('#romMode').onchange = () => {
  try { localStorage.setItem('romMode', $('#romMode').value); } catch (e) {}
  const box = $('#lyrics'); box.className = 'm-' + $('#romMode').value;
  const d = box.querySelector('.now'); if (d) box.scrollTo({ top: d.offsetTop - box.clientHeight / 2 + d.offsetHeight / 2, behavior: prefs.calm ? 'auto' : 'smooth' });
};

