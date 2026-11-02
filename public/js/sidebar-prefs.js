// ---- live queue sidebar
function renderSide() {
  $('#qCount').textContent = queue.length; $('#qN').textContent = queue.length ? '(' + queue.length + ')' : '';
  const box = $('#sideQ'); box.textContent = '';
  if (!queue.length) box.appendChild(el('p', 'The queue is empty.', 'note'));
  queue.forEach((it, i) => {
    const row = el('div', null, 'qi'), info = el('div');
    info.append(el('b', it.song.title), el('small', whoTxt(it) + ' · ' + it.song.artist + (it.song.kv ? ' · 🎤 karaoke' : '')));
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
let micGain = null, micSrc = null, vdest = null, micSup = null;
let gate = null, gateState = -1, listenDelay = 0, latIv = 0;
const prefs = Object.assign({ fs: 1, vol: 100, sens: 1, calm: false, delay: 0, lead: 0, vsync: 0, hp: true, lowLat: true, sup: 'std', thr: 0, kar: false, cover: true, theme: 'neon' }, (() => { try { return JSON.parse(localStorage.getItem('karaokePrefs')) || {}; } catch (e) { return {}; } })());
function applyPrefs(save = true) {
  document.documentElement.style.setProperty('--fs', prefs.fs);
  document.documentElement.classList.toggle('calm', prefs.calm);
  $('#pFs').value = prefs.fs; $('#pFsV').textContent = Math.round(prefs.fs * 100) + '%';
  $('#sVol').value = prefs.vol; $('#sVolV').textContent = prefs.vol + '%';
  $('#sLive').value = prefs.sens; $('#sLiveV').textContent = Number(prefs.sens).toFixed(1) + '×';
  $('#pSens').value = prefs.sens; $('#pSensV').textContent = Number(prefs.sens).toFixed(1) + '×';
  $('#pDel').value = prefs.delay; $('#pDelV').textContent = Number(prefs.delay).toFixed(2) + 's';
  $('#pLead').value = prefs.lead; $('#pLeadV').textContent = Number(prefs.lead).toFixed(2) + 's';
  $('#pVs').value = prefs.vsync; $('#pVsV').textContent = Number(prefs.vsync).toFixed(2) + 's';
  $('#pCalm').checked = prefs.calm; $('#pHp').checked = $('#rdHp').checked = prefs.hp;
  $('#karOn').checked = !!prefs.kar; if (window.syncKarMode) syncKarMode(); $('#pCover').checked = !!prefs.cover; document.body.classList.toggle('nocover', !prefs.cover);
  ['#pLow', '#tLow'].forEach(i => { const x = $(i); if (x) x.checked = prefs.lowLat !== false; });   // (a missing checkbox must never break the rest of the settings)
  prefs.sup = supLevel(prefs.sup); ['#pSup', '#tSup'].forEach(i => { const x = $(i); if (x) x.value = prefs.sup; });
  ['#pSupNote', '#tSupNote'].forEach(i => { const x = $(i); if (x) x.textContent = supNote(prefs.sup); }); prefs.thr = prefs.thr >= 0 && prefs.thr <= 100 ? +prefs.thr : 0;
  ['#pThr', '#tThr'].forEach(i => { const x = $(i); if (x) x.value = prefs.thr; });
  ['#pThrV', '#tThrV'].forEach(i => { const x = $(i); if (x) x.textContent = prefs.thr ? Math.round(supThrDb(prefs.thr)) + ' dB' : 'Off'; });
  document.querySelectorAll('.thrmeter .m').forEach(m => { m.style.left = prefs.thr + '%'; m.style.display = prefs.thr ? 'block' : 'none'; });
  supApplyAll(prefs.sup, prefs.thr);
  if (typeof refreshTheme === 'function') refreshTheme();
  if (micGain) micGain.gain.value = prefs.sens;
  if (player && player.setVolume) { try { player.setVolume(prefs.vol); } catch (e) {} }
  if (audio) audio.volume = prefs.vol / 100;
  if (save) { try { localStorage.setItem('karaokePrefs', JSON.stringify(prefs)); } catch (e) {} }
}
[['pFs', 'fs'], ['sVol', 'vol'], ['pSens', 'sens'], ['sLive', 'sens'], ['pDel', 'delay'], ['pLead', 'lead'], ['pVs', 'vsync'], ['pThr', 'thr'], ['tThr', 'thr']].forEach(([id, k]) => $('#' + id).oninput = e => { prefs[k] = parseFloat(e.target.value); applyPrefs(); });
['#pLow', '#tLow'].forEach(i => { const x = $(i); if (x) x.onchange = e => { prefs.lowLat = e.target.checked; applyPrefs(); if (typeof lowLatApply === 'function') lowLatApply(); }; });   // low-latency voice: applies right away
setInterval(() => {   // the live mic meters in Settings and Mic test (only while one of them is open)
  if (!document.querySelector('#prefs[open], #mtest[open]')) return;
  const m = supMeter();
  document.querySelectorAll('.thrmeter .f').forEach(f => { f.style.width = m.lvl + '%'; f.classList.toggle('shut', !!prefs.thr && !m.open); f.classList.toggle('hot', m.lvl > 90); });
}, 60);
function supChanged() {   // Mic suppression changed: the gate and filters switch at once; the browser's own noise suppression needs the mic reopened
  applyPrefs();
  setTimeout(() => { if (typeof switchMic === 'function') switchMic('sup'); if (typeof tStream !== 'undefined' && tStream && typeof tStart === 'function') tStart(); }, 0);
}
['#pSup', '#tSup'].forEach(i => { const x = $(i); if (x) x.onchange = e => { prefs.sup = supLevel(e.target.value); supChanged(); }; });
$('#pCalm').onchange = e => { prefs.calm = e.target.checked; applyPrefs(); };
$('#karOn').onchange = e => { prefs.kar = e.target.checked; applyPrefs(); };
$('#pCover').onchange = e => { prefs.cover = e.target.checked; applyPrefs(); };
$('#pHp').onchange = $('#rdHp').onchange = e => { prefs.hp = e.target.checked; applyPrefs(); };
$('#pReset').onclick = () => { Object.assign(prefs, { fs: 1, vol: 100, sens: 1, calm: false, delay: 0, lead: 0, vsync: 0, hp: true, lowLat: true, sup: 'std', thr: 0, kar: false, cover: true }); applyPrefs(); if (typeof lowLatApply === 'function') lowLatApply(); supChanged(); };   // the theme is chosen on the home page
$('#gear').onclick = $('#lSettings').onclick = () => { $('#prefs').showModal(); loadDevices(false); };   // the header gear, and the Settings button on the home page
