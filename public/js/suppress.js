// ---- mic suppression: Off / Standard / Strong / Maximum
// Standard is how the app always behaved. Strong and Maximum also (a) ask the browser for its own noise suppression,
// (b) cut rumble and hiss outside the voice range, and (c) run a noise gate that learns the background level and
// quiets the mic while you are not clearly louder than it (TV in the room, fans, family on other computers).
// It cannot tell your voice from someone else's voice: sit close to the mic, or use headphones, for the best result.
const SUP_LEVELS = {
  off:    { label: 'Off',      wet: 0 },
  std:    { label: 'Standard', wet: 0 },
  strong: { label: 'Strong',   wet: 1, hp: 100, lp: 8000, margin: 2,   fg: 0.2 },    // gate: you must be ~6 dB above the background; quiet parts drop to -14 dB
  max:    { label: 'Maximum',  wet: 1, hp: 150, lp: 6500, margin: 3.4, fg: 0.03 }    // ~10.5 dB above the background; quiet parts drop to -30 dB
};
const SUP_NOTES = {
  off: 'Raw microphone with no processing at all. Only for a quiet room with headphones; without headphones the song can leak into your mic.',
  std: 'The app’s usual settings. Fine for a quiet room or when you wear headphones.',
  strong: 'Asks the browser to remove background noise, trims rumble and hiss, and turns your mic down while you are not clearly louder than the room. A good start when a TV or family are nearby. If your singing sounds thin or cut up, go back to Standard.',
  max: 'Strongest: the background is cut almost completely whenever you are not singing or talking. It cannot tell your voice from other voices, so keep the mic close and the TV down. If the start of your words gets clipped, use Strong.'
};
const supNote = l => SUP_NOTES[supLevel(l)] + ([...supInst].some(s => !s.hasGate && s.ctx.state !== 'closed') && SUP_LEVELS[supLevel(l)].wet ? ' (This browser cannot run the noise gate, so only the filters and the browser’s own suppression are active.)' : '');
const supThrDb = t => -60 + t * 0.6;                           // Mic threshold slider 1..100  ->  -59 dB .. 0 dB (0 = off)
const supThrLin = t => t > 0 ? Math.pow(10, supThrDb(t) / 20) : 0;
const supLevel = l => SUP_LEVELS[l] ? l : 'std';
function supCons(level, kind) {   // what to ask the browser for (kind: 'vc' = voice chat, 'sing' = singing)
  level = supLevel(level);
  if (level === 'off') return { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (level === 'std') return kind === 'vc' ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { noiseSuppression: false };
  return Object.assign({ noiseSuppression: true, autoGainControl: false }, kind === 'vc' ? { echoCancellation: true } : {});
}
const supInst = new Set();
function supApplyAll(level, thr) { supInst.forEach(s => { if (s.ctx.state === 'closed') supInst.delete(s); else s.set(level, thr); }); }
function supMeter() {   // the level of the mic that is on right now (the newest one), 0-100 on the same scale as the Mic threshold slider
  let last = null; supInst.forEach(s => { if (s.ctx.state === 'running') last = s; });
  return last ? { on: true, lvl: last.meter(), open: last.open } : { on: false, lvl: 0, open: true };
}
async function makeSuppressor(ctx, level, thr) {   // input -> (dry | filters -> noise gate) -> output; switching level is instant
  const inp = ctx.createGain(), out = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
  hp.type = 'highpass'; lp.type = 'lowpass'; hp.Q.value = 0.7; lp.Q.value = 0.7; hp.frequency.value = 10; lp.frequency.value = 18000;
  const an = ctx.createAnalyser(), mbuf = new Float32Array(1024); an.fftSize = 1024;   // level meter: sees exactly what the gate sees
  inp.connect(dry); dry.connect(out); inp.connect(hp); hp.connect(lp); lp.connect(an);
  let node = null;
  try {
    if (ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
      ctx.__supMod = ctx.__supMod || ctx.audioWorklet.addModule('js/suppress-worklet.js');
      await ctx.__supMod;
      node = new AudioWorkletNode(ctx, 'karaoke-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
    }
  } catch (e) { node = null; }                      // no worklet here: the filters still work, only the gate is missing
  if (node) { lp.connect(node); node.connect(wet); node.port.onmessage = e => { if (e.data && e.data.open != null) api.open = !!e.data.open; }; } else lp.connect(wet);
  wet.connect(out); wet.gain.value = 0;
  const api = {
    ctx, in: inp, out, hasGate: !!node, level: 'std', thr: 0, open: true,
    meter() {
      an.getFloatTimeDomainData(mbuf); let sum = 0; for (let i = 0; i < mbuf.length; i++) sum += mbuf[i] * mbuf[i];
      const rms = Math.sqrt(sum / mbuf.length), db = rms > 0 ? 20 * Math.log10(rms) : -100; return Math.max(0, Math.min(100, (db + 60) / 60 * 100));
    },
    set(l, t) {   // l = Off/Standard/Strong/Maximum, t = Mic threshold (0 = off)
      l = supLevel(l); if (t != null) api.thr = t >= 0 && t <= 100 ? +t : 0;
      const c = SUP_LEVELS[l], on = !!c.wet || api.thr > 0, now = ctx.currentTime; api.level = l;
      try {
        dry.gain.setTargetAtTime(on ? 0 : 1, now, 0.02); wet.gain.setTargetAtTime(on ? 1 : 0, now, 0.02);
        hp.frequency.setTargetAtTime(c.wet ? c.hp : 10, now, 0.02); lp.frequency.setTargetAtTime(c.wet ? c.lp : 18000, now, 0.02);
        if (node) node.port.postMessage({ on, margin: c.margin || 2, floorGain: c.wet ? c.fg : 0, abs: supThrLin(api.thr) });
        if (!on) api.open = true;
      } catch (e) {}
    }
  };
  api.set(level, thr); supInst.add(api); return api;
}
