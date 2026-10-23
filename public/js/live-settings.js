// ---- settings that take effect right away, even in the middle of a song
// (Most sliders and switches already did: lyric size, song volume, mic sensitivity, audio delay, show lines early, themes, motion.
//  This file adds the ones that used to need a restart: the microphone, Headphones mode and the lyrics display mode.)
let micBusy = false, micAgain = '';
async function switchMic(reason) {   // reason: 'device' (a different microphone) or 'hp' (Headphones mode changed)
  if (micBusy) { micAgain = micAgain === 'device' || reason === 'device' ? 'device' : (reason || 'hp'); return; }
  micBusy = true;
  try {
    let why = reason;
    while (why) {
      micAgain = '';
      const mid = $('#micSel').value;
      // 1) the singer's microphone for the song that is playing: swap the source, keep the same audio path (gain, limiter, gate) and the same WebRTC track, so nothing reconnects
      if (active && stream && actx && actx.state !== 'closed' && micGain) {
        try {
          const ns = await navigator.mediaDevices.getUserMedia({ audio: Object.assign(micC(), mid ? { deviceId: { exact: mid } } : {}) });
          if (!active || !actx || actx.state === 'closed') ns.getTracks().forEach(t => t.stop());
          else {
            const src = actx.createMediaStreamSource(ns); src.connect(micGain);
            try { if (micSrc) micSrc.disconnect(); } catch (e) {}
            const old = stream; stream = ns; micSrc = src; old.getTracks().forEach(t => t.stop());
            const lb = (ns.getAudioTracks()[0] || {}).label;
            say(why === 'device' ? 'Microphone switched' + (lb ? ' to ' + lb : '') + '.' : 'Headphones mode ' + (prefs.hp ? 'on' : 'off') + ': microphone updated.');
          }
        } catch (e) {
          say('Could not switch the microphone (' + (e.name || e.message) + '). Still using the previous one.');
          try {   // put the picker back on the microphone that is still working
            const sel = $('#micSel'), prev = ((stream.getAudioTracks()[0] || {}).getSettings || (() => ({})))().deviceId;
            sel.value = prev && [...sel.options].some(o => o.value === prev) ? prev : '';
          } catch (x) {}
        }
      }
      // 2) the voice chat microphone (only a different device matters there)
      if (why === 'device' && typeof vc !== 'undefined' && vc.on && vc.stream) {
        try {
          const nv = await navigator.mediaDevices.getUserMedia({ audio: Object.assign({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }, mid ? { deviceId: { exact: mid } } : {}) });
          if (!vc.on) nv.getTracks().forEach(t => t.stop());
          else {
            const nt = nv.getAudioTracks()[0]; nt.enabled = !vc.muted && !vcSinging();
            await Promise.all(Object.values(vc.pcs).map(pc => Promise.all(pc.getSenders().filter(s => s.track && s.track.kind === 'audio').map(s => s.replaceTrack(nt).catch(() => {})))));
            const old = vc.stream; vc.stream = nv; old.getTracks().forEach(t => t.stop());
          }
        } catch (e) { say('Could not switch the voice chat microphone (' + (e.name || e.message) + ').'); }
      }
      why = micAgain;   // the person changed something again while we were busy: go round once more with the newest choice
    }
  } finally { micBusy = false; }
}
$('#micSel').addEventListener('change', () => switchMic('device'));
$('#tSel').addEventListener('change', () => { if (active) setTimeout(() => switchMic('device'), 0); });   // the Mic test window picks the same microphone
[$('#pHp'), $('#rdHp')].forEach(x => x.addEventListener('change', () => setTimeout(() => switchMic('hp'), 0)));   // after prefs.hp has been saved

// Lyrics display (original / romanized / both) changes straight away
$('#romMode').addEventListener('change', () => { if (active) $('#lyrics').className = 'm-' + $('#romMode').value; });
