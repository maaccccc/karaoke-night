// ---- chat
let chatUnread = 0, toastT = 0;
function addChat(m, quiet) {
  if (isMuted(m.from)) return;   // you muted this person
  const log = $('#chatLog'), d = el('div', null, 'cm' + (m.from === room.name ? ' me' : ''));
  const b = el('b', (m.av ? m.av.e + ' ' : '') + m.from + ': '); if (m.av) b.style.setProperty('--wc', m.av.c);
  d.append(b, document.createTextNode(m.text)); log.appendChild(d);
  while (log.children.length > 80) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  if (quiet || m.from === room.name || chatVisible()) return;
  chatUnread++; chatLabel(); 
  const tt = $('#chatToast'); tt.textContent = (m.av ? m.av.e + ' ' : '') + m.from + ': ' + m.text; tt.style.display = 'block'; if (window.vcToastPlace) vcToastPlace();
  clearTimeout(toastT); toastT = setTimeout(() => tt.style.display = 'none', 4500);
}
const chatPhone = () => true;   // phones: the chat is a tab in the voice bubble
const chatVisible = () => chatPhone() ? !!(window.vcDock && vcDock.shows('chat')) : !$('#chat').classList.contains('min') && (matchMedia('(min-width:1000px)').matches || $('#side').classList.contains('open'));
function chatSeen() { chatUnread = 0; $('#chatToast').style.display = 'none'; $('#chatLog').scrollTop = 1e9; chatLabel(); }
function chatLabel() {      // the header button shows – while open and + while minimised; unread count shows on the bar
  const c = $('#chat'), m = c.classList.contains('min'), x = $('#chatX');
  x.textContent = m ? '+' : '–'; x.setAttribute('aria-label', m ? 'Show chat' : 'Minimise chat'); x.title = m ? 'Show chat' : 'Minimise chat';
  $('#chatTitle').textContent = '💬 Chat' + (m && chatUnread ? ' (' + chatUnread + ' new)' : '');
}
function toggleChat(open) {
  if (chatPhone() && window.vcDock) { const on = vcDock.shows('chat'); vcDock.open(open === undefined ? !on : open, 'chat'); return; }
  // header button: on a phone it opens the drawer; on desktop it expands/minimises the docked chat
  const c = $('#chat'), narrow = !matchMedia('(min-width:1000px)').matches;
  const o = open === undefined ? (narrow ? true : c.classList.contains('min')) : open;
  c.classList.toggle('min', !o); if (o && narrow) $('#side').classList.add('open');
  if (o) { chatUnread = 0; $('#chatToast').style.display = 'none'; $('#chatLog').scrollTop = 1e9; $('#chatIn').focus(); }
  chatLabel();
}
function sendChat() { const t = $('#chatIn').value.trim(); if (!t || !room.on) return; $('#chatIn').value = ''; roomOp({ op: 'chat', text: t }); }
$('#chatX').onclick = e => { e.stopPropagation(); toggleChat($('#chat').classList.contains('min')); };
$('#chat .chead').onclick = () => $('#chatX').click(); $('#chatToast').onclick = () => toggleChat(true);
$('#chatSend').onclick = sendChat; $('#chatIn').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
