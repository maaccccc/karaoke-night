// ---- live queue sidebar
function renderSide() {
  $('#qCount').textContent = queue.length; $('#qN').textContent = queue.length ? '(' + queue.length + ')' : '';
  const box = $('#sideQ'); box.textContent = '';
  if (!queue.length) box.appendChild(el('p', 'The queue is empty.', 'note'));
  queue.forEach((it, i) => {
    const row = el('div', null, 'qi'), info = el('div');
    info.append(el('b', it.song.title), el('small', whoTxt(it) + ' · ' + it.song.artist));
    const rm = el('button', '✕', 'ghost mini'); rm.setAttribute('aria-label', 'Remove ' + it.song.title);
    rm.onclick = () => { if (room.on) roomOp({ op: 'qrm', id: it.id }); else { queue.splice(i, 1); renderQueue(); } };
    row.append(el('span', String(i + 1), 'qn'), info, rm); box.appendChild(row);
  });
  renderNow();
}
function renderNow() {
  const box = $('#nowBox'); box.textContent = '';
  if (!current || !active) { box.appendChild(el('p', 'Nobody yet. Start a song!', 'note')); return; }
  const pr = el('div', null, 'prog'), pi = el('i'); pi.id = 'prog'; pr.appendChild(pi);
  const sc = el('b', '0 pts'); sc.id = 'nowScore';
  box.append(el('b', current.song.title), el('small', current.singer + ' · ' + current.song.artist), pr, sc);
}
$('#sideToggle').onclick = () => $('#side').classList.toggle('open');
$('#sideClose').onclick = () => $('#side').classList.remove('open');

// ---- preferences
let micGain = null, micSrc = null, vdest = null;
let gate = null, gateState = -1, listenDelay = 0, latIv = 0;
const prefs = Object.assign({ fs: 1, vol: 100, sens: 1, calm: false, delay: 0, lead: 0, vsync: 0, hp: true, theme: 'auto' }, (() => { try { return JSON.parse(localStorage.getItem('karaokePrefs')) || {}; } catch (e) { return {}; } })());
function applyPrefs(save = true) {
  document.documentElement.style.setProperty('--fs', prefs.fs);
  document.documentElement.classList.toggle('calm', prefs.calm);
  $('#pFs').value = prefs.fs; $('#pFsV').textContent = Math.round(prefs.fs * 100) + '%';
  $('#pVol').value = prefs.vol; $('#pVolV').textContent = prefs.vol + '%';
  $('#sLive').value = prefs.sens; $('#sLiveV').textContent = Number(prefs.sens).toFixed(1) + '×';
  $('#pSens').value = prefs.sens; $('#pSensV').textContent = Number(prefs.sens).toFixed(1) + '×';
  $('#pDel').value = prefs.delay; $('#pDelV').textContent = Number(prefs.delay).toFixed(2) + 's';
  $('#pLead').value = prefs.lead; $('#pLeadV').textContent = Number(prefs.lead).toFixed(2) + 's';
  $('#pVs').value = prefs.vsync; $('#pVsV').textContent = Number(prefs.vsync).toFixed(2) + 's';
  $('#pCalm').checked = prefs.calm; $('#pHp').checked = $('#rdHp').checked = prefs.hp;
  $('#pTheme').value = prefs.theme; if (typeof refreshTheme === 'function') refreshTheme();
  if (micGain) micGain.gain.value = prefs.sens;
  if (player && player.setVolume) { try { player.setVolume(prefs.vol); } catch (e) {} }
  if (audio) audio.volume = prefs.vol / 100;
  if (save) { try { localStorage.setItem('karaokePrefs', JSON.stringify(prefs)); } catch (e) {} }
}
[['pFs', 'fs'], ['pVol', 'vol'], ['pSens', 'sens'], ['sLive', 'sens'], ['pDel', 'delay'], ['pLead', 'lead'], ['pVs', 'vsync']].forEach(([id, k]) => $('#' + id).oninput = e => { prefs[k] = parseFloat(e.target.value); applyPrefs(); });
$('#pCalm').onchange = e => { prefs.calm = e.target.checked; applyPrefs(); };
$('#pTheme').onchange = e => { prefs.theme = e.target.value; applyPrefs(); };
$('#pHp').onchange = $('#rdHp').onchange = e => { prefs.hp = e.target.checked; applyPrefs(); };
$('#pReset').onclick = () => { Object.assign(prefs, { fs: 1, vol: 100, sens: 1, calm: false, delay: 0, lead: 0, vsync: 0, hp: true, theme: 'auto' }); applyPrefs(); };
$('#gear').onclick = () => { $('#prefs').showModal(); loadDevices(false); };
