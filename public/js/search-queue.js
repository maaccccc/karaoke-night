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
async function search() {
  const q = $('#q').value.trim(); if (q.length < 2) return; badgeQ.length = 0;
  say('Searching…');
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    const list = await r.json(); if (!r.ok) throw new Error(list.error);
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
      const bd = el('span', 'checking lyrics…', 'bdg'); info.firstChild.appendChild(bd); badgeQ.push([s, bd]); runBadges();
      const add = el('button', room.on ? 'Add to my queue' : 'Add to queue');
      add.onclick = () => { if (room.on) { roomOp({ op: 'qadd', song: { videoId: s.videoId, title: s.title, artist: s.artist, duration: s.duration } }); say('Queued: ' + s.title); return; } queue.push({ song: s, singer: sel.value, file: null }); renderQueue(); say('Queued: ' + s.title); };
      row.append(...(sel ? [info, sel, add] : [info, add])); box.appendChild(row);
    });
    say('Pick a song to add to the queue.');
  } catch (e) { say('Search failed: ' + e.message); }
}
$('#searchBtn').onclick = search;
$('#q').onkeydown = e => { if (e.key === 'Enter') search(); };

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
function renderQueue() { if (!room.on) queue.splice(0, queue.length, ...fairOrder(queue, localSung)); renderQueueMain(); renderSide(); }
function renderQueueMain() {
  const box = $('#queue'); box.textContent = '';
  if (!queue.length) { box.appendChild(el('p', 'Nothing queued yet.', 'note')); return; }
  queue.forEach((it, i) => {
    const row = el('div', null, 'item');
    const info = el('div'); info.append(el('span', it.song.title + ' (' + whoTxt(it) + (it.mode && it.mode !== 'solo' ? ' · ' + modeName[it.mode] : '') + ')'),
      el('small', it.song.artist + ' · plays from YouTube'));
    const rm = el('button', 'Remove', 'ghost'); rm.onclick = () => { if (room.on) roomOp({ op: 'qrm', id: it.id }); else { queue.splice(i, 1); renderQueue(); } };
    row.append(info, rm); box.appendChild(row);
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

