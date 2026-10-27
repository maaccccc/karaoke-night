// "＋ Add songs" while a song is playing: a side panel over the stage (also in fullscreen) to search and queue songs without leaving the lyrics.
// It reuses the normal search API and addSong(), so karaoke versions, duplicate checks and room queues behave exactly as on the home page.
(() => {
  let panel = null, input, resBox, qBox, timer = 0, ctl = null, seq = 0, lastQ = '', tick = 0, rows = [];
  const mkEl = (t, cls, txt) => { const e = document.createElement(t); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function build() {
    if (panel) return;
    panel = mkEl('aside', ''); panel.id = 'addPanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Add songs to the queue');
    const head = mkEl('div', 'apHead'), x = mkEl('button', 'ghost', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close;
    head.append(mkEl('b', '', '＋ Add songs'), x);
    input = mkEl('input'); input.type = 'search'; input.placeholder = 'Search a song or artist…'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Search for a song to queue');
    qBox = mkEl('div', 'apQueue note'); resBox = mkEl('div', 'apRes');
    panel.append(head, input, qBox, resBox); document.body.appendChild(panel);
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(false), 400); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') search(true); });
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } e.stopPropagation(); });   // typing here must not trigger the stage's key shortcuts
  }
  const stageOn = () => { const s = document.getElementById('stage'); return !!s && s.style.display !== 'none'; };
  function open() {
    build(); panel.hidden = false; document.body.classList.add('apOpen'); refresh(); input.focus();
    clearInterval(tick); tick = setInterval(() => { if (!stageOn()) { close(); return; } refresh(); }, 1000);
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true; document.body.classList.remove('apOpen'); clearInterval(tick); clearTimeout(timer); if (ctl) ctl.abort();
    const b = document.getElementById('addBtn'); if (b) b.focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel && !panel.hidden) close(); });   // Esc when focus is outside the panel (the Add button disables itself after a click)
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#addBtn'); if (!b) return; if (panel && !panel.hidden) close(); else open(); });
  function refresh() {          // the queue summary, and which results are already queued
    const n = queue.length;
    qBox.textContent = n ? 'Queue (' + n + '): ' + queue.slice(0, 4).map((it, i) => (i + 1) + '. ' + it.song.title + (it.singer ? ' · ' + it.singer : '')).join('   ') + (n > 4 ? '   …' : '') : 'Nothing queued yet.';
    rows.forEach(r => { if (r.btn.dataset.busy === '1') return; const d = !!dupeOf(r.song); r.btn.disabled = d; r.btn.textContent = d ? (r.added ? '✓ Added' : '✓ Queued') : 'Add to queue'; });
  }
  async function search(force) {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { seq++; if (ctl) ctl.abort(); lastQ = ''; rows = []; resBox.textContent = ''; return; }
    if (!force && q === lastQ) return;
    lastQ = q; const mine = ++seq; if (ctl) ctl.abort(); ctl = new AbortController();
    resBox.textContent = ''; resBox.appendChild(mkEl('p', 'note', 'Searching…'));
    try {
      const r = await fetch('/api/search?q=' + encodeURIComponent(q), { signal: ctl.signal });
      const list = await r.json(); if (!r.ok) throw new Error(list.error);
      if (mine !== seq) return;
      resBox.textContent = ''; rows = [];
      if (!list.length) { resBox.appendChild(mkEl('p', 'note', 'No songs found. Try different words.')); return; }
      list.forEach(s => {
        const song = song0(s), row = mkEl('div', 'apRow'), info = mkEl('div', 'apInfo');
        const bd = mkEl('span', 'bdg', 'checking lyrics…'); const t = mkEl('span', 'apT', s.title); t.appendChild(bd);
        info.append(t, mkEl('small', '', s.artist + ' · ' + fmt(s.duration)));
        fetch('/api/haslyrics?' + new URLSearchParams({ title: s.title, artist: s.artist, duration: s.duration || 0 })).then(x => x.json())
          .then(d => { bd.textContent = d.has ? 'synced lyrics ✓' : 'no synced lyrics'; bd.className = 'bdg ' + (d.has ? 'ok' : 'no'); }).catch(() => bd.remove());
        let sel = null;
        if (!room.on) { sel = mkEl('select'); sel.setAttribute('aria-label', 'Singer for ' + s.title); (players.length ? players : ['Anyone']).forEach(p => sel.appendChild(mkEl('option', '', p))); }
        const btn = mkEl('button', '', 'Add to queue'); btn.type = 'button';
        btn.onclick = async () => {
          btn.disabled = true; btn.dataset.busy = '1'; btn.textContent = prefs.kar ? 'Finding karaoke…' : 'Adding…';
          let ok = false; try { ok = await addSong(s, sel ? sel.value : '', null); } catch (e) {}
          btn.dataset.busy = ''; rec.added = ok; refresh();
        };
        const rec = { song, btn, added: false }; rows.push(rec); row.append(info, ...(sel ? [sel] : []), btn); resBox.appendChild(row);
      });
      refresh();
    } catch (e) { if (e.name === 'AbortError' || mine !== seq) return; lastQ = ''; resBox.textContent = ''; resBox.appendChild(mkEl('p', 'note', 'Search failed: ' + e.message)); }
  }
})();
