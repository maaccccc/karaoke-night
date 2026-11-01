// status.html: asks the server (/api/status) whether each outside service works, and refreshes every 30 seconds.
(function () {
  const $ = s => document.querySelector(s), LABEL = { up: 'Working', slow: 'Slow', down: 'Down', off: 'Not set up' };
  const TITLE = { ok: 'Everything is working', minor: 'Some things are slow or down', major: 'A main service is down' };
  const NOTE = { ok: 'Songs, lyrics and playback should all be fine.', minor: 'Karaoke Night still works, but something may look off.', major: 'Songs may not load or play until it is back. This is on their side, not yours.' };
  const banner = $('#stBanner'), btn = $('#stAgain'); let busy = false, timer = 0;
  function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function render(d) {
    banner.dataset.state = d.overall; $('#stTitle').textContent = TITLE[d.overall] || 'Checked'; $('#stNote').textContent = NOTE[d.overall] || '';
    const list = $('#stList'); list.textContent = '';
    d.services.forEach(s => {
      const row = el('div', null, 'st-row'); row.dataset.s = s.status;
      const h = el('h2', s.name); if (s.status !== 'off' && s.ms) h.appendChild(el('small', s.ms + ' ms'));
      row.append(el('span', null, 'st-dot'), h, el('span', LABEL[s.status] || s.status, 'st-pill'), el('p', s.what));
      row.append(el('p', s.detail + (s.status === 'down' || s.status === 'slow' ? ' ' + s.impact : ''), 'st-fx'));
      list.appendChild(row);
    });
    const t = new Date(d.checked * 1000).toLocaleTimeString();
    $('#stFoot').textContent = 'Last checked ' + t + '. ' + (d.savedLyrics ? d.savedLyrics + ' songs have their lyrics saved on this server, so they keep working even if the lyrics service is down. ' : '') + 'Updates every 30 seconds.';
  }
  async function load(fresh) {
    if (busy) return; busy = true; btn.disabled = true; clearTimeout(timer);
    banner.dataset.state = 'load'; $('#stTitle').textContent = 'Checking…'; $('#stNote').textContent = 'This takes a few seconds.';
    try {
      const r = await fetch('/api/status' + (fresh ? '?fresh=1' : ''), { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status === 429 ? 'Too many checks. Wait a moment and try again.' : 'The server answered with an error (' + r.status + ').');
      render(await r.json());
    } catch (e) {
      banner.dataset.state = 'err'; $('#stTitle').textContent = 'Could not check';
      $('#stNote').textContent = e && e.message && e.message !== 'Failed to fetch' ? e.message : 'The Karaoke Night server itself did not answer. Is it running?';
    }
    busy = false; btn.disabled = false; timer = setTimeout(() => load(false), 30000);
  }
  btn.onclick = () => load(true);
  load(false);
})();
