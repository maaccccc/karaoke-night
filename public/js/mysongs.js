// ---- "My songs": favourites and singing history, kept on THIS device (in this browser's localStorage). Nothing is sent to the server.
// Clearing the browser's site data, a private window or another browser starts empty, because there are no accounts.
const Mine = (() => {
  const FK = 'karaokeFavs', HK = 'karaokeHist', MAXF = 300, MAXH = 200;
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
  let tab = 'fav';
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const mmss = d => d ? Math.floor(d / 60) + ':' + String(d % 60).padStart(2, '0') : '';
  const ready = () => !document.body.classList.contains('home');   // queueing needs the singing page (solo or a room), not the welcome page
  function row(s, detail) {
    const r = el('div', null, 'item'), info = el('div'); info.append(el('span', s.title), el('small', s.artist + (detail ? ' · ' + detail : '')));
    const acts = el('div', null, 'pvact');
    const q = el('button', room.on ? '＋ My queue' : '＋ Queue', 'ghost'); q.type = 'button'; q.disabled = !ready(); q.title = ready() ? 'Add this song to the queue' : 'Start solo or join a room first';
    q.onclick = async () => { const ok = await addSong(s, room.on ? '' : (players.length ? players[0] : 'Anyone'), q); if (ok) { q.textContent = '✓ Queued'; q.disabled = true; } };
    const f = el('button', Mine.isFav(s.videoId) ? '★' : '☆', 'ghost favbtn'); f.type = 'button'; f.title = 'Favourite'; f.setAttribute('aria-label', 'Favourite'); f.setAttribute('aria-pressed', String(Mine.isFav(s.videoId)));
    f.onclick = () => { const on = Mine.toggleFav(s); f.textContent = on ? '★' : '☆'; f.setAttribute('aria-pressed', String(on)); if (tab === 'fav') render(); };
    acts.append(q, f); r.append(info, acts); return r;
  }
  function render() {
    const box = document.getElementById('msList'), st = Mine.stats(); box.textContent = '';
    dlg.querySelectorAll('.msTabs button').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    document.getElementById('msStats').textContent = st.n ? 'You have sung ' + st.n + (st.n === 1 ? ' song' : ' songs') + ' on this device. Best score ' + st.best + ', average ' + st.avg + '.' : '';
    document.getElementById('msClear').style.display = tab === 'hist' && st.n ? '' : 'none';
    const list = tab === 'fav' ? Mine.favs().map(f => ({ s: f, d: mmss(f.duration) })) : tab === 'hist' ? Mine.history().map(h => ({ s: h, d: (h.pts ? h.pts + ' pts · ' : '') + ago(h.t) })) : Mine.top().map(t => ({ s: t, d: 'sung ' + t.n + '× · best ' + t.best }));
    if (!list.length) { box.appendChild(el('p', tab === 'fav' ? 'No favourites yet. Press ☆ next to a song in the search results.' : 'Nothing here yet. Songs you sing will show up here.', 'note')); return; }
    list.forEach(x => box.appendChild(row(x.s, x.d)));
    if (!ready()) box.prepend(el('p', 'Start solo or join a room to add songs to the queue.', 'note'));
  }
  const open = () => { render(); dlg.showModal(); };
  document.querySelectorAll('[data-mine]').forEach(b => b.addEventListener('click', open));
  dlg.querySelectorAll('.msTabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  document.getElementById('msClear').onclick = () => { if (confirm('Clear your singing history on this device? Favourites are kept.')) { Mine.clearHistory(); render(); } };
})();
