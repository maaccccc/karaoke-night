// ---- microphone check (first visit, and from the Mic test button)
const tSegs = []; for (let i = 0; i < 24; i++) { const x = el('i'); if (i >= 16) x.className = i >= 21 ? 'r' : 'y'; $('#tVu').appendChild(x); tSegs.push(x); }
let tStream = null, tCtx = null, tRaf = 0, tMonGain = null;
try { $('#tMon').checked = localStorage.getItem('tMon') !== '0'; } catch (e) {}
const tMonApply = () => { if (tMonGain) tMonGain.gain.value = $('#tMon').checked ? 1 : 0; try { localStorage.setItem('tMon', $('#tMon').checked ? '1' : '0'); } catch (e) {} };
$('#tMon').onchange = tMonApply;
async function tSink(ctx) {   // send the sound to the output picked in this window (falls back to the system default)
  const id = $('#tOut').value, name = $('#tOut').selectedOptions[0] ? $('#tOut').selectedOptions[0].textContent : 'Default speakers';
  const note = $('#tOutNote');
  try {
    if (!ctx.setSinkId) { if (id) note.textContent = 'This browser cannot choose an output here, so sound goes to your system default speakers. Use Chrome or Edge, or change the default output in Windows Sound settings.'; return; }
    await ctx.setSinkId(id || '');
    note.textContent = 'Your voice plays through: ' + name + '. If you still hear nothing, press the test sound and try the other entry.';
  } catch (e) { note.textContent = 'Could not use “' + name + '” (' + (e.name || e.message) + '), so sound goes to the default speakers.'; }
}
$('#tOut').onchange = () => { $('#outSel').value = $('#tOut').value; if (tCtx) tSink(tCtx); };
$('#tBeep').onclick = async () => {   // plays a short tone the same way, so you can check the output without the mic
  const c = new (window.AudioContext || window.webkitAudioContext)(); try { await c.resume(); } catch (e) {}
  await tSink(c);
  const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 523; g.gain.value = .0001;
  o.connect(g); g.connect(c.destination); const t = c.currentTime;
  g.gain.exponentialRampToValueAtTime(.25, t + .05); g.gain.exponentialRampToValueAtTime(.0001, t + .7); o.start(t); o.stop(t + .75);
  setTimeout(() => c.close().catch(() => {}), 1200);
};
function tDraw(l) { const n = Math.round(l * 24); tSegs.forEach((x, i) => x.classList.toggle('on', i < n)); }
function tStop() {
  cancelAnimationFrame(tRaf); tDraw(0);
  if (tStream) { tStream.getTracks().forEach(t => t.stop()); tStream = null; }
  if (tCtx) { tCtx.close().catch(() => {}); tCtx = null; } tMonGain = null;
}
async function tStart() {
  tStop(); const st = $('#tStatus'); st.style.color = ''; st.textContent = 'Starting the microphone…';
  $('#tAgain').style.display = 'none';
  try {
    tCtx = new (window.AudioContext || window.webkitAudioContext)(); try { await tCtx.resume(); } catch (e) {}
    const mid = $('#tSel').value; $('#micSel').value = mid;
    tStream = await navigator.mediaDevices.getUserMedia({ audio: Object.assign(micC(), mid ? { deviceId: { exact: mid } } : {}) });
    loadDevices(false);   // device names are available now
    const an2 = tCtx.createAnalyser(); an2.fftSize = 2048; const g = tCtx.createGain(); g.gain.value = prefs.sens;
    tCtx.createMediaStreamSource(tStream).connect(g); g.connect(an2);
    const lim = tCtx.createDynamicsCompressor(); lim.threshold.value = -12; lim.knee.value = 6; lim.ratio.value = 12;   // limiter: keeps a sudden feedback squeal from being painfully loud
    tMonGain = tCtx.createGain(); g.connect(lim); lim.connect(tMonGain); tMonGain.connect(tCtx.destination); tMonApply();   // what you hear
    await tSink(tCtx);
    const label = (tStream.getAudioTracks()[0] || {}).label || 'your microphone'; setMic('tested');   // tells the Lobby this mic works
    st.textContent = 'Listening on "' + label + '". Say something!';
    const buf = new Float32Array(2048), t0 = performance.now(); let loud = 0, lvl = 0, done = false;
    const loop = () => {
      if (!tStream) return;
      an2.getFloatTimeDomainData(buf); let sum = 0; for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length); lvl = Math.max(Math.min(1, rms * 5), lvl * .86); tDraw(lvl);
      if (rms > .02) loud++;
      if (!done && loud > 12) { done = true; st.style.color = '#3be58a'; st.textContent = '✓ We can hear you! Your mic works.'; $('#tAgain').style.display = ''; try { localStorage.setItem('micChecked', '1'); } catch (e) {} }
      else if (!done && performance.now() - t0 > 6000) { st.style.color = '#ffd23d'; st.textContent = 'We can’t hear you. Speak louder or closer, raise Mic sensitivity in Settings, pick another microphone above, or check that it is not muted.'; $('#tAgain').style.display = ''; }
      tRaf = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {
    tStop(); st.style.color = '#ff6b7d'; setMic(e.name === 'NotAllowedError' ? 'blocked' : e.name === 'NotFoundError' ? 'none' : 'error');
    st.textContent = e.name === 'NotAllowedError' ? 'Microphone is blocked. Click the lock icon in the address bar, allow the microphone, then press Test again.'
      : e.name === 'NotFoundError' ? 'No microphone found. Plug one in or pick another above.' : 'Could not open the microphone (' + (e.name || e.message) + ').';
    $('#tAgain').style.display = '';
  }
}
function openMicTest() { $('#tSel').value = $('#micSel').value; $('#tOut').value = $('#outSel').value; $('#tStatus').textContent = ''; $('#tAgain').style.display = 'none'; $('#mtest').showModal(); loadDevices(false); }
$('#tStart').onclick = tStart; $('#tAgain').onclick = tStart;
$('#tSel').onchange = () => { $('#micSel').value = $('#tSel').value; if (tStream) tStart(); };
