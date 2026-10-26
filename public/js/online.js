// Live "people online" strip on the home page (above the Sing solo / Create / Join cards). Sends a small heartbeat; the server only counts, it never stores names.
(function () {
  const box = document.getElementById('onl'), wrap = document.getElementById('onlw'); if (!box || !wrap) return;
  const MIN_SHOW = 2;                  // below this the strip stays hidden: "1 person online" is just you and makes the site look empty
  const id = deviceId('online');       // one id per device, so ten tabs count as one person online
  function show(d) {
    const n = Number(d.online) || 0;
    if (n < MIN_SHOW) { wrap.classList.remove('show'); wrap.setAttribute('aria-hidden', 'true'); return; }
    const span = box.lastChild, inRooms = Number(d.inRooms) || 0, rooms = Number(d.rooms) || 0;
    span.textContent = '';
    const b = document.createElement('b'); b.textContent = n; span.append(b, ' online now');
    if (inRooms) {
      const r = document.createElement('b'); r.textContent = inRooms;
      const q = document.createElement('b'); q.textContent = rooms;
      span.append(' \u00b7 ', r, ' in ', q, rooms === 1 ? ' room' : ' rooms');
    }
    wrap.classList.add('show'); wrap.removeAttribute('aria-hidden');
  }
  async function ping() {
    try {
      const r = await fetch('/api/online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      show(await r.json());
    } catch (e) { wrap.classList.remove('show'); wrap.setAttribute('aria-hidden', 'true'); }
  }
  ping(); setInterval(ping, 20000);
  // (no "leave" message on close: other tabs of this device may still be open, and the entry expires by itself a few seconds later)
})();
