// ---- search (YouTube Music)
const badgeQ = []; let badgeBusy = 0;
function runBadges() {
  while (badgeBusy < 3 && badgeQ.length) {
    const [s, bd] = badgeQ.shift(); badgeBusy++;
    fetch('/api/haslyrics?' + new URLSearchParams({ title: s.title, artist: s.artist, duration: s.duration || 0 })).then(r => r.json())
      .then(d => { bd.textContent = d.has ? 'synced lyrics ✓' : 'no synced lyrics'; bd.className = 'bdg ' + (d.has ? 'ok' : 'no'); })
      .catch(() => bd.remove()).finally(() => { badgeBusy--; runBadges(); });
  }
}
// ---- preview a result (a short clip from the middle of the YouTube video) so you know it is the right song before you queue it
let pvPlayer = null, pvWrap = null, pvBtn = null, pvTimer = 0;
function stopPreview() {
  clearTimeout(pvTimer);
  if (pvPlayer) { try { pvPlayer.destroy(); } catch (e) {} pvPlayer = null; }
  if (pvWrap) { pvWrap.remove(); pvWrap = null; }
  if (pvBtn) { pvBtn.textContent = '▶ Preview'; pvBtn.classList.remove('on'); pvBtn = null; }
}
async function startPreview(s, btn, row) {
  const same = pvBtn === btn; stopPreview(); if (same) return;      // pressing the same button again just stops it
  pvBtn = btn; btn.textContent = '■ Stop'; btn.classList.add('on');
  const wrap = el('div', null, 'pvwrap'), holder = el('div'); holder.id = 'pvyt'; wrap.appendChild(holder); row.after(wrap); pvWrap = wrap;
  await loadYT(); if (pvWrap !== wrap) return;                        // stopped while the player was loading
  const start = Math.max(0, Math.min(45, Math.floor((s.duration || 0) * 0.25)));   // skip the intro
  pvPlayer = new YT.Player('pvyt', { width: 320, height: 180, videoId: s.videoId,
    playerVars: { autoplay: 1, start, playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
    events: {
      onReady: e => { try { e.target.setVolume(prefs.vol); } catch (x) {} e.target.playVideo(); pvTimer = setTimeout(stopPreview, 30000); },   // a 30 second taste
      onStateChange: e => { if (e.data === YT.PlayerState.ENDED) stopPreview(); },
      onError: () => { say('YouTube won’t play this video here, so it can’t be previewed.'); stopPreview(); }
    } });
}
async function findKaraoke(s, fresh) {   // a karaoke video {videoId, title, duration}, null = none found, undefined = the lookup failed
  try {
    const r = await fetch('/api/karaoke?' + new URLSearchParams({ title: s.title, artist: s.artist, duration: s.duration || 0, fresh: fresh ? 1 : 0 })), list = await r.json();
    return r.ok && list.length ? { videoId: list[0].videoId, title: list[0].title, duration: list[0].duration } : null;
  } catch (e) { return undefined; }
}
// ---- duplicate detection: the same song cannot be queued twice (or while it is playing), so nobody can spam one song.
// (The server applies the same rule in rooms, see song_key / same_song in server.py.)
function songKey(title, artist) {
  const norm = t => String(t || '').toLowerCase().replace(/[(\[{][^)\]}]*[)\]}]/g, ' ').split(/\b(?:feat|ft|featuring)\b\.?/)[0].replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().replace(/\s+/g, ' ');
  return norm(title) + '|' + norm(String(artist || '').split(/\s*(?:,|&|;| x | and )\s*/)[0]);
}
function sameSong(a, b) {
  if (!a || !b) return false;
  if (a.videoId && a.videoId === b.videoId) return true;
  const ka = songKey(a.title, a.artist);
  if (ka.startsWith('|') || ka !== songKey(b.title, b.artist)) return false;
  const da = +a.duration || 0, db = +b.duration || 0;
  return !(da && db && Math.abs(da - db) > 30);      // same name but a very different length = a different arrangement
}
const song0 = s => ({ videoId: s.videoId, title: s.title, artist: s.artist, duration: s.duration });
function dupeOf(song) {                              // the queued (or playing) song this one duplicates, or null
  const q = queue.find(it => sameSong(it.song, song));
  if (q) return q.song;
  return (active && current && sameSong(current.song, song)) ? current.song : null;
}
const dupeBtns = [];                                 // [song, button] of the current search results
function markDupes() {
  dupeBtns.forEach(([song, btn, label]) => {
    const d = !!dupeOf(song);
    btn.disabled = d || btn.dataset.busy === '1'; btn.textContent = d ? '✓ Already queued' : label; btn.title = d ? 'This song is already in the queue (or playing now)' : '';
  });
}
// Adds a song to the queue (own queue in a room, the shared device queue in solo). Used by the search results and by My songs.
async function addSong(s, singer, btn) {
    const song = { videoId: s.videoId, title: s.title, artist: s.artist, duration: s.duration };
    if (dupeOf(song)) { markDupes(); say('“' + s.title + '” is already in the queue, so it was not added again.'); return false; }
    let note = '';
    if (prefs.kar) {      // swap in a karaoke (instrumental) video; the lyrics still come from the original song
      if (btn) { btn.disabled = true; btn.dataset.busy = '1'; } say('Finding a karaoke version of ' + s.title + '…');
      const kv = await findKaraoke(song);
      if (kv) { song.kv = kv; note = ' (karaoke version)'; }
      else note = kv === null ? ' ⚠ no karaoke version found, so the ORIGINAL (with the singer) will play. Press “🎤 Find karaoke” on it in the queue to try again.' : ' ⚠ could not look for a karaoke version, so the original will play. Press “🎤 Find karaoke” on it in the queue to try again.';
      if (btn) { btn.disabled = false; btn.dataset.busy = ''; }
      if (dupeOf(song)) { markDupes(); say('“' + s.title + '” was just added by someone else, so it was not added again.'); return false; }   // queued while the karaoke lookup ran
    }
    if (room.on) { roomOp({ op: 'qadd', song }); say('Queued: ' + s.title + note); return true; }
    queue.push({ song, singer, file: null }); renderQueue(); say('Queued: ' + s.title + note); return true;
}
let searchSeq = 0, searchCtl = null, lastQ = '', searchTimer = 0;
async function search(force) {
  clearTimeout(searchTimer);
  const q = $('#q').value.trim();
  if (q.length < 2) {     // typed too little (or cleared the box): drop any search still running and empty the list
    searchSeq++; if (searchCtl) searchCtl.abort(); lastQ = '';
    if (!q.length) { badgeQ.length = 0; dupeBtns.length = 0; stopPreview(); $('#results').textContent = ''; say(''); }
    return;
  }
  if (!force && q === lastQ) return;       // same words as the results already on screen
  lastQ = q; const mySeq = ++searchSeq; if (searchCtl) searchCtl.abort(); searchCtl = new AbortController();
  badgeQ.length = 0; dupeBtns.length = 0; stopPreview();
  say('Searching…');
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q), { signal: searchCtl.signal });
    const list = await r.json(); if (!r.ok) throw new Error(list.error);
    if (mySeq !== searchSeq) return;        // a newer search started while this one was loading
    const box = $('#results'); box.textContent = '';
    if (!list.length) box.appendChild(el('p', 'No songs found. Try different words.', 'note'));
    list.forEach(s => {
      const row = el('div', null, 'item');
      const info = el('div'); info.append(el('span', s.title), el('small', s.artist + ' · ' + fmt(s.duration)));
      let sel = null;
      if (!room.on) {   // same-device play: pick which of the people you added is singing. In a room you always queue as yourself.
        sel = el('select'); sel.setAttribute('aria-label', 'Singer for ' + s.title);
        (players.length ? players : ['Anyone']).forEach(p => sel.appendChild(el('option', p)));
      }
      const bd = el('span', 'checking lyrics…', 'bdg'); info.firstChild.appendChild(bd); badgeQ.push([s, bd]);
      const add = el('button', room.on ? 'Add to my queue' : 'Add to queue');
      add.onclick = () => addSong(s, sel ? sel.value : '', add);
      dupeBtns.push([song0(s), add, add.textContent]);
      const pv = el('button', '▶ Preview', 'ghost pvbtn'); pv.type = 'button'; pv.title = 'Listen to a 30 second clip to check it is the right song'; pv.onclick = () => startPreview(s, pv, row);
      const fb = el('button', Mine.isFav(s.videoId) ? '★' : '☆', 'ghost favbtn'); fb.type = 'button'; fb.title = 'Save to My songs (favourites)'; fb.setAttribute('aria-label', 'Favourite ' + s.title); fb.setAttribute('aria-pressed', String(Mine.isFav(s.videoId)));
      fb.onclick = () => { const on = Mine.toggleFav(song0(s)); fb.textContent = on ? '★' : '☆'; fb.setAttribute('aria-pressed', String(on)); };
      const acts = el('div', null, 'pvact'); acts.append(fb, pv, add);
      row.append(...(sel ? [info, sel, acts] : [info, acts])); box.appendChild(row);
    });
    markDupes(); say('Pick a song to add to the queue.');
    setTimeout(() => { if (mySeq === searchSeq) runBadges(); }, 800);   // lyric badges wait until typing has settled, so live search does not flood the server
  } catch (e) { if (e.name === 'AbortError' || mySeq !== searchSeq) return; lastQ = ''; say('Search failed: ' + e.message); }
}
$('#q').onkeydown = e => { if (e.key === 'Enter') search(true); };
$('#q').addEventListener('input', () => {      // live search: runs shortly after you stop typing, no Enter needed
  clearTimeout(searchTimer); searchTimer = setTimeout(search, 450);
});

// ---- queue
// Fair queue for same-device play: people take turns, so one person queuing five songs does not block the others.
const localSung = {}; let localTurn = 0;
function fairOrder(items, sung) {
  const last = Object.assign({}, sung), left = items.slice(), out = []; let turn = 1e6;
  while (left.length) {
    let best = 0, bl = Infinity;
    left.forEach((it, i) => { const l = last[it.singer] === undefined ? -1 : last[it.singer]; if (l < bl) { bl = l; best = i; } });
    const it = left.splice(best, 1)[0]; out.push(it); last[it.singer] = turn++; if (it.singer2) last[it.singer2] = turn;
  }
  return out;
}
function renderQueue() { if (!room.on) queue.splice(0, queue.length, ...fairOrder(queue, localSung)); renderQueueMain(); renderSide(); markDupes(); }
function renderQueueMain() {
  const box = $('#queue'); box.textContent = '';
  if (!queue.length) { box.appendChild(el('p', 'Nothing queued yet.', 'note')); return; }
  queue.forEach((it, i) => {
    const row = el('div', null, 'item');
    const info = el('div'); info.append(el('span', it.song.title + ' (' + whoTxt(it) + (it.mode && it.mode !== 'solo' ? ' · ' + modeName[it.mode] : '') + ')'),
      el('small', it.song.artist + (it.song.kv ? ' · 🎤 karaoke version' : ' · original recording (has the singer’s vocals)')));
    const rm = el('button', 'Remove', 'ghost'); rm.onclick = () => { if (room.on) roomOp({ op: 'qrm', id: it.id }); else { queue.splice(i, 1); renderQueue(); } };
    const kb = it.song.kv ? null : el('button', '🎤 Find karaoke', 'ghost');
    if (kb) kb.onclick = async () => {      // no karaoke version yet (it was queued before the box was ticked, or none was found): try now
      kb.disabled = true; say('Looking for a karaoke version of ' + it.song.title + '…');
      const kv = await findKaraoke(it.song, true); kb.disabled = false;
      if (!kv) { say(kv === null ? 'Still no karaoke version found for ' + it.song.title + ', so the original will play.' : 'Could not look for a karaoke version. Try again.'); return; }
      if (room.on) roomOp({ op: 'qkv', id: it.id, kv }); else if (queue.includes(it)) { it.song.kv = kv; renderQueue(); }
      say('Karaoke version found for ' + it.song.title + '.');
    };
    row.append(...(kb ? [info, kb, rm] : [info, rm])); box.appendChild(row);
  });
}
$('#saveBtn').onclick = async () => {
  if (!queue.length) { say('Queue a song first.'); return; }
  say('Saving playlist…');
  try {
    const r = await fetch('/api/playlist', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Karaoke Night', videoIds: queue.map(i => i.song.videoId) }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    say('Playlist saved: ' + d.url);
  } catch (e) { say('Could not save playlist: ' + e.message); }
};

