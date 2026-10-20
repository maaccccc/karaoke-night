// Live "people online" status on the home page. Sends a small heartbeat; the server only counts, it never stores names.
(function () {
  const box = document.getElementById('onl'); if (!box) return;
  let id = ''; try { id = sessionStorage.getItem('karaokeVid') || ''; } catch (e) {}
  if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join(''); try { sessionStorage.setItem('karaokeVid', id); } catch (e) {} }
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
  addEventListener('pagehide', () => { try { navigator.sendBeacon('/api/online', JSON.stringify({ id, leave: true })); } catch (e) {} });
})();
