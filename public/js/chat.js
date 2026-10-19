// ---- chat
let chatUnread = 0, toastT = 0;
function addChat(m, quiet) {
  const log = $('#chatLog'), d = el('div', null, 'cm' + (m.from === room.name ? ' me' : ''));
  const b = el('b', (m.av ? m.av.e + ' ' : '') + m.from + ': '); if (m.av) b.style.setProperty('--wc', m.av.c);
  d.append(b, document.createTextNode(m.text)); log.appendChild(d);
  while (log.children.length > 80) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  if (quiet || m.from === room.name || chatVisible()) return;
  chatUnread++; const bt = $('#chatBtn'); bt.classList.add('unread'); bt.querySelector('.bd').textContent = chatUnread;
  const tt = $('#chatToast'); tt.textContent = (m.av ? m.av.e + ' ' : '') + m.from + ': ' + m.text; tt.style.display = 'block';
  clearTimeout(toastT); toastT = setTimeout(() => tt.style.display = 'none', 4500);
}
const chatVisible = () => !$('#chat').classList.contains('min') && (matchMedia('(min-width:1000px)').matches || $('#side').classList.contains('open'));
function toggleChat(open) {   // header button: on a phone it opens the drawer; on desktop it expands/minimises the docked chat
  const c = $('#chat'), narrow = !matchMedia('(min-width:1000px)').matches;
  const o = open === undefined ? (narrow ? true : c.classList.contains('min')) : open;
  c.classList.toggle('min', !o); if (o && narrow) $('#side').classList.add('open');
  if (o) { chatUnread = 0; $('#chatBtn').classList.remove('unread'); $('#chatToast').style.display = 'none'; $('#chatLog').scrollTop = 1e9; $('#chatIn').focus(); }
}
function sendChat() { const t = $('#chatIn').value.trim(); if (!t || !room.on) return; $('#chatIn').value = ''; roomOp({ op: 'chat', text: t }); }
$('#chatBtn').onclick = () => toggleChat(); $('#chatX').onclick = () => toggleChat(false); $('#chatToast').onclick = () => toggleChat(true);
$('#chatSend').onclick = sendChat; $('#chatIn').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
