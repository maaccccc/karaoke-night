// Live "people online" status on the home page. Sends a small heartbeat; the server only counts, it never stores names.
(function () {
  const box = document.getElementById('onl'); if (!box) return;
  const id = deviceId('online');       // one id per device, so ten tabs count as one person online
  function show(d) {
    const n = d.online || 0; if (!n) { box.hidden = true; return; }
    let t = n + (n === 1 ? ' person' : ' people') + ' online now';
    if (d.inRooms) t += ' · ' + d.inRooms + ' in ' + d.rooms + (d.rooms === 1 ? ' room' : ' rooms');
    box.lastChild.textContent = t; box.hidden = false;
  }
  async function ping() {
    try {
      const r = await fetch('/api/online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      show(await r.json());
    } catch (e) { box.hidden = true; }
  }
  ping(); setInterval(ping, 20000);
  // (no "leave" message on close: other tabs of this device may still be open, and the entry expires by itself a few seconds later)
})();
