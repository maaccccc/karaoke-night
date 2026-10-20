// Global chat on the home page: everyone visiting the site can talk here, no room needed.
// Uses long-polling like the room chat, so it works through tunnels and Render. Polling pauses while you are in a room or the tab is hidden.
(function () {
  const log = document.getElementById('gLog'); if (!log) return;
  const inp = document.getElementById('gIn'), note = document.getElementById('gNote'), empty = document.getElementById('gEmpty');
  let id = ''; try { id = sessionStorage.getItem('karaokeGid') || ''; } catch (e) {}
  if (!id) { id = rid(); try { sessionStorage.setItem('karaokeGid', id); } catch (e) {} }
  let last = null, sending = false;
  const myName = () => $('#rName').value.trim();
  const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  function add(m) {
    if (last !== null && m.id <= last) return;
    last = m.id; if (empty) empty.remove();
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 60, mine = m.from === myName();
    const d = el('div', null, 'cm' + (mine ? ' me' : '')), b = el('b', (m.av ? m.av.e + ' ' : '') + m.from + ': ');
    if (m.av) b.style.setProperty('--wc', m.av.c);
    d.append(b, document.createTextNode(m.text), el('small', clock(m.at)));
    log.appendChild(d);
    while (log.querySelectorAll('.cm').length > 80) log.querySelector('.cm').remove();
    if (near || mine) log.scrollTop = log.scrollHeight;
  }
  function load(d) {
    if (d.reset) { log.querySelectorAll('.cm').forEach(x => x.remove()); last = null; }
    (d.msgs || []).forEach(add);
    if (last === null || d.last < last) last = d.last;
    if (!log.querySelector('.cm') && !document.getElementById('gEmpty')) log.appendChild(Object.assign(el('p', 'No messages yet. Say hi!', 'note'), { id: 'gEmpty' }));
  }
  async function loop() {
    for (;;) {
      if (!document.body.classList.contains('home') || document.hidden) { await new Promise(r => setTimeout(r, 1500)); continue; }
      try {
        const r = await fetch('/api/gchat' + (last === null ? '' : '?since=' + last));
        if (!r.ok) throw new Error(); load(await r.json());
      } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
    }
  }
  async function send() {
    const text = inp.value.trim(), name = myName();
    if (!text || sending) return;
    if (!name) { note.textContent = 'Enter your name in “Get set” first.'; $('#rName').focus(); return; }
    sending = true; note.textContent = '';
    try { localStorage.setItem('karaokeName', name); } catch (e) {}
    try {
      const d = await rpost('/api/gchat', { id, name, av: myAv, text });
      inp.value = ''; if (d.msg) add(d.msg);
    } catch (e) { note.textContent = e.message; }
    sending = false; inp.focus();
  }
  document.getElementById('gSend').onclick = send;
  inp.onkeydown = e => { if (e.key === 'Enter') send(); };
  loop();
})();
