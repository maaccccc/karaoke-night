// ---- "My songs": favourites and singing history, kept on THIS device (in this browser's localStorage). Nothing is sent to the server.
// Clearing the browser's site data, a private window or another browser starts empty, because there are no accounts.
const Mine = (() => {
  const FK = 'karaokeFavs', HK = 'karaokeHist', PK = 'karaokePlaylists', MAXF = 300, MAXH = 200, MAXP = 30, MAXS = 200;
  const load = k => { try { const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const save = (k, a) => { try { localStorage.setItem(k, JSON.stringify(a)); } catch (e) {} };
  const slim = s => ({ videoId: String(s.videoId || '').slice(0, 24), title: String(s.title || '').slice(0, 120), artist: String(s.artist || '').slice(0, 80), duration: Math.round(+s.duration || 0) });
  const changed = () => document.dispatchEvent(new CustomEvent('mine-change'));
  return {
    favs: () => load(FK), history: () => load(HK),
    isFav: id => load(FK).some(f => f.videoId === id),
    toggleFav(song) {                     // returns true when the song is now a favourite
      const a = load(FK), i = a.findIndex(f => f.videoId === song.videoId);
      if (i >= 0) a.splice(i, 1); else a.unshift(Object.assign(slim(song), { t: Date.now() }));
      save(FK, a.slice(0, MAXF)); changed(); return i < 0;
    },
    played(song, pts) {                   // called when you finish singing a song
      if (!song || !song.videoId) return;
      const a = load(HK); a.unshift(Object.assign(slim(song), { pts: Math.round(+pts || 0), t: Date.now() })); save(HK, a.slice(0, MAXH)); changed();
    },
    clearHistory() { save(HK, []); changed(); },
    // ---- playlists: named lists of songs, saved on this device like the favourites ----
    playlists: () => load(PK),
    newPlaylist(name, song) {             // returns the new playlist, or null when there are too many
      const a = load(PK); if (a.length >= MAXP) return null;
      const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(name || '').trim().slice(0, 40) || 'Playlist', songs: [], t: Date.now() };
      if (song && song.videoId) p.songs.push(slim(song));
      a.unshift(p); save(PK, a); changed(); return p;
    },
    renamePlaylist(id, name) { const a = load(PK), p = a.find(x => x.id === id), n = String(name || '').trim().slice(0, 40); if (!p || !n) return; p.name = n; save(PK, a); changed(); },
    deletePlaylist(id) { save(PK, load(PK).filter(x => x.id !== id)); changed(); },
    addToPlaylist(id, song) {             // 'added' | 'dupe' | 'full' | 'missing'
      const a = load(PK), p = a.find(x => x.id === id); if (!p || !song || !song.videoId) return 'missing';
      if (p.songs.some(x => x.videoId === song.videoId)) return 'dupe';
      if (p.songs.length >= MAXS) return 'full';
      p.songs.push(slim(song)); save(PK, a); changed(); return 'added';
    },
    removeFromPlaylist(id, videoId) { const a = load(PK), p = a.find(x => x.id === id); if (!p) return; p.songs = p.songs.filter(x => x.videoId !== videoId); save(PK, a); changed(); },
    moveInPlaylist(id, videoId, dir) {    // dir -1 = up, +1 = down
      const a = load(PK), p = a.find(x => x.id === id); if (!p) return;
      const i = p.songs.findIndex(x => x.videoId === videoId), j = i + dir; if (i < 0 || j < 0 || j >= p.songs.length) return;
      [p.songs[i], p.songs[j]] = [p.songs[j], p.songs[i]]; save(PK, a); changed();
    },
    async addToPlaylistUI(song) {         // asks which playlist (or a new one); returns the playlist name when the song was added, else null
      const a = load(PK); let v = '__new';
      if (a.length) {
        v = await kPick('Choose a playlist for “' + song.title + '”.', { title: 'Add to a playlist', choices: a.map(p => ({ label: p.name + ' (' + p.songs.length + ')', value: p.id })).concat([{ label: '＋ New playlist…', value: '__new' }]) });
        if (!v) return null;
      }
      if (v === '__new') {
        const n = await kPrompt('Name your new playlist.', { title: 'New playlist', ok: 'Create', placeholder: 'e.g. Friday night classics', max: 40 }); if (!n) return null;
        const p = Mine.newPlaylist(n, song);
        if (!p) { await kAlert('You can keep up to ' + MAXP + ' playlists on this device. Delete one first.', { title: 'Too many playlists' }); return null; }
        return p.name;
      }
      const r = Mine.addToPlaylist(v, song), name = (load(PK).find(x => x.id === v) || {}).name || 'the playlist';
      if (r === 'added') return name;
      await kAlert(r === 'dupe' ? '“' + song.title + '” is already in ' + name + '.' : r === 'full' ? name + ' is full (' + MAXS + ' songs).' : 'That playlist no longer exists.', { title: r === 'dupe' ? 'Already there' : 'Could not add' });
      return null;
    },
    top() {                               // most sung first
      const m = new Map();
      load(HK).forEach(h => { const o = m.get(h.videoId) || Object.assign(slim(h), { n: 0, best: 0, t: 0 }); o.n++; o.best = Math.max(o.best, h.pts || 0); o.t = Math.max(o.t, h.t || 0); m.set(h.videoId, o); });
      return [...m.values()].sort((a, b) => b.n - a.n || b.best - a.best || b.t - a.t);
    },
    stats() { const h = load(HK); return { n: h.length, best: h.reduce((m, x) => Math.max(m, x.pts || 0), 0), avg: h.length ? Math.round(h.reduce((s, x) => s + (x.pts || 0), 0) / h.length) : 0 }; }
  };
})();

(() => {
  const dlg = document.getElementById('mysongs'); if (!dlg || !dlg.showModal) return;
  let tab = 'fav', openPl = null;   // openPl = id of the playlist being viewed on the Playlists tab
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const mmss = d => d ? Math.floor(d / 60) + ':' + String(d % 60).padStart(2, '0') : '';
  const ready = () => !document.body.classList.contains('home');   // queueing needs the singing page (solo or a room), not the welcome page
  function row(s, detail, pl) {
    const r = el('div', null, 'item'), info = el('div'); info.append(el('span', s.title), el('small', s.artist + (detail ? ' · ' + detail : '')));
    const acts = el('div', null, 'pvact');
    const q = el('button', room.on ? '＋ My queue' : '＋ Queue', 'ghost'); q.type = 'button'; q.disabled = !ready(); q.title = ready() ? 'Add this song to the queue' : 'Start solo or join a room first';
    q.onclick = async () => { const ok = await addSong(s, room.on ? '' : (players.length ? players[0] : 'Anyone'), q); if (ok) { q.textContent = '✓ Queued'; q.disabled = true; } };
    const f = el('button', Mine.isFav(s.videoId) ? '★' : '☆', 'ghost favbtn'); f.type = 'button'; f.title = 'Favourite'; f.setAttribute('aria-label', 'Favourite'); f.setAttribute('aria-pressed', String(Mine.isFav(s.videoId)));
    f.onclick = () => { const on = Mine.toggleFav(s); f.textContent = on ? '★' : '☆'; f.setAttribute('aria-pressed', String(on)); if (tab === 'fav') render(); };
    if (pl) {                                  // inside a playlist: move up / down and remove
      const mv = (txt, label, dir) => { const b = el('button', txt, 'ghost favbtn plbtn'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label + ': ' + s.title); b.onclick = () => { Mine.moveInPlaylist(pl, s.videoId, dir); render(); }; return b; };
      const rm = el('button', '✕', 'ghost favbtn plbtn'); rm.type = 'button'; rm.title = 'Remove from this playlist'; rm.setAttribute('aria-label', 'Remove ' + s.title + ' from this playlist'); rm.onclick = () => { Mine.removeFromPlaylist(pl, s.videoId); render(); };
      acts.append(q, mv('▲', 'Move up', -1), mv('▼', 'Move down', 1), rm);
    } else {
      const lb = el('button', '📂', 'ghost favbtn plbtn'); lb.type = 'button'; lb.title = 'Add to a playlist'; lb.setAttribute('aria-label', 'Add ' + s.title + ' to a playlist');
      lb.onclick = async () => { const n = await Mine.addToPlaylistUI(s); if (n) { lb.textContent = '✓'; lb.title = 'Added to ' + n; } };
      acts.append(q, f, lb);
    }
    r.append(info, acts); return r;
  }
  const total = songs => { const t = songs.reduce((s, x) => s + (x.duration || 0), 0); return t ? ' · ' + (t >= 3600 ? Math.floor(t / 3600) + ' h ' : '') + Math.round((t % 3600) / 60) + ' min' : ''; };
  const countText = n => n + (n === 1 ? ' song' : ' songs');
  function renderPl(box) {
    const all = Mine.playlists(), p = openPl && all.find(x => x.id === openPl);
    if (openPl && !p) openPl = null;
    if (!p) {                                  // the list of playlists
      const nb = el('button', '＋ New playlist', 'plnew'); nb.type = 'button';
      nb.onclick = async () => {
        const n = await kPrompt('Name your new playlist.', { title: 'New playlist', ok: 'Create', placeholder: 'e.g. Friday night classics', max: 40 }); if (!n) return;
        const np = Mine.newPlaylist(n); if (!np) { await kAlert('You can keep up to 30 playlists on this device. Delete one first.', { title: 'Too many playlists' }); return; }
        openPl = np.id; render();
      };
      box.appendChild(nb);
      if (!all.length) { box.appendChild(el('p', 'No playlists yet. Make one here, then add songs with the 📂 button next to a song in the search results, favourites or history.', 'note')); return; }
      all.forEach(pl => {
        const r = el('div', null, 'item'), info = el('div'); info.append(el('span', '📂 ' + pl.name), el('small', countText(pl.songs.length) + total(pl.songs)));
        const acts = el('div', null, 'pvact'), ob = el('button', 'Open', 'ghost'); ob.type = 'button'; ob.setAttribute('aria-label', 'Open playlist ' + pl.name); ob.onclick = () => { openPl = pl.id; render(); };
        acts.append(ob); r.append(info, acts); box.appendChild(r);
      });
      return;
    }
    const bar = el('div', null, 'plbar');                                    // one playlist
    const back = el('button', '← Playlists', 'ghost'); back.type = 'button'; back.onclick = () => { openPl = null; render(); };
    bar.append(back, el('h3', p.name)); box.appendChild(bar);
    const acts = el('div', null, 'plbar'), singer = () => room.on ? '' : (players.length ? players[0] : 'Anyone');
    const qa = el('button', '＋ Queue all'); qa.type = 'button'; qa.disabled = !ready() || !p.songs.length; qa.title = ready() ? 'Add every song in this playlist to the queue, in order' : 'Start solo or join a room first';
    qa.onclick = async () => {
      qa.disabled = true; let n = 0;
      for (let i = 0; i < p.songs.length; i++) { qa.textContent = 'Queuing ' + (i + 1) + ' / ' + p.songs.length + '…'; if (await addSong(p.songs[i], singer())) n++; }
      qa.textContent = '✓ Queued ' + n + (n < p.songs.length ? ' (' + (p.songs.length - n) + ' already in the queue)' : '');
    };
    const rn = el('button', 'Rename', 'ghost'); rn.type = 'button';
    rn.onclick = async () => { const n = await kPrompt('Give this playlist a new name.', { title: 'Rename playlist', ok: 'Save', value: p.name, max: 40 }); if (n) { Mine.renamePlaylist(p.id, n); render(); } };
    const del = el('button', 'Delete', 'ghost'); del.type = 'button';
    del.onclick = async () => { if (await kConfirm('Delete the playlist “' + p.name + '”? The songs themselves are not deleted from anywhere else.', { title: 'Delete this playlist?', ok: 'Delete playlist', danger: true })) { Mine.deletePlaylist(p.id); openPl = null; render(); } };
    acts.append(qa, rn, del); box.appendChild(acts);
    box.appendChild(el('p', countText(p.songs.length) + total(p.songs), 'note'));
    if (!ready() && p.songs.length) box.appendChild(el('p', 'Start solo or join a room to queue these songs.', 'note'));
    if (!p.songs.length) { box.appendChild(el('p', 'This playlist is empty. Add songs with the 📂 button next to a song in the search results, favourites or history.', 'note')); return; }
    p.songs.forEach(s => box.appendChild(row(s, mmss(s.duration), p.id)));
  }
  function render() {
    const box = document.getElementById('msList'), st = Mine.stats(); box.textContent = '';
    dlg.querySelectorAll('.msTabs button').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    document.getElementById('msStats').textContent = st.n ? 'You have sung ' + st.n + (st.n === 1 ? ' song' : ' songs') + ' on this device. Best score ' + st.best + ', average ' + st.avg + '.' : '';
    document.getElementById('msClear').style.display = tab === 'hist' && st.n ? '' : 'none';
    if (tab === 'pl') { renderPl(box); return; }
    const list = tab === 'fav' ? Mine.favs().map(f => ({ s: f, d: mmss(f.duration) })) : tab === 'hist' ? Mine.history().map(h => ({ s: h, d: (h.pts ? h.pts + ' pts · ' : '') + ago(h.t) })) : Mine.top().map(t => ({ s: t, d: 'sung ' + t.n + '× · best ' + t.best }));
    if (!list.length) { box.appendChild(el('p', tab === 'fav' ? 'No favourites yet. Press ☆ next to a song in the search results.' : 'Nothing here yet. Songs you sing will show up here.', 'note')); return; }
    list.forEach(x => box.appendChild(row(x.s, x.d)));
    if (!ready()) box.prepend(el('p', 'Start solo or join a room to add songs to the queue.', 'note'));
  }
  const open = () => { render(); dlg.showModal(); };
  document.querySelectorAll('[data-mine]').forEach(b => b.addEventListener('click', open));
  dlg.querySelectorAll('.msTabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; if (tab === 'pl') openPl = null; render(); });
  document.getElementById('msClear').onclick = async () => { if (await kConfirm('Clear your singing history on this device? Favourites are kept.', { title: 'Clear your history?', ok: 'Clear history', danger: true })) { Mine.clearHistory(); render(); } };
})();
