// ---- optional AI judge (Google Gemini, called by the server): one playful line on the results screen. The server only answers when
// GEMINI_API_KEY is set (see server.py); otherwise this stays hidden. Only numbers and the song title are sent, never audio.
(() => {
  const cache = {}; let off = false;          // one request per result: re-drawing the results screen reuses the same comment
  const base = window.renderAwards;
  if (typeof base !== 'function') return;
  window.renderAwards = function () {
    const out = base.apply(this, arguments);
    try { judge(); } catch (e) {}
    return out;
  };
  async function judge() {
    const box = document.getElementById('judge'); if (!box || off) return;
    const mine = room && room.on ? room.name : null;
    const r = (awData.list || []).find(x => x.hasMic && (!mine || x.name === mine)); if (!r || !current || !current.song) return;
    const key = current.song.title + '|' + r.pts + '|' + r.name; box.hidden = true;
    if (cache[key]) { box.textContent = '🎙 Judge: ' + cache[key]; box.hidden = false; return; }
    if (cache[key] === null) return; cache[key] = null;      // null = a request for this result is already on its way
    const body = { title: current.song.title, pts: r.pts, parts: r.parts, combo: (r.combo || {}).max || 0,
      share: S && S.ai > 20 ? S.aiS / S.ai : null, tune: typeof inTune === 'function' && S ? inTune() : null };
    try {
      const j = await (await fetch('/api/judge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (j.off) { off = true; return; }
      if (j.ok && j.text) { cache[key] = j.text; box.textContent = '🎙 Judge: ' + j.text; box.hidden = false; } else delete cache[key];
    } catch (e) { delete cache[key]; }
  }
})();
