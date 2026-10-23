// Noise gate for the microphone, running on the audio thread (so it keeps working when the tab is in the background).
// It learns how loud the background is (TV, fans, other people in the room) by tracking the quietest level of the last
// few seconds, and turns the microphone down while you are not clearly louder than that. A 20 ms look-ahead means the
// first syllable of every word is not clipped.
class KaraokeGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.margin = 2; this.floorGain = 0.2; this.abs = 0; this.lastOpen = true;                       // how far above the background you must be, and how quiet the mic gets when you are not
    this.L = Math.round(sampleRate * 0.02); this.d = new Float32Array(this.L); this.p = 0;   // look-ahead delay line
    this.env = 0; this.hold = 0; this.g = 1;
    this.holdBlocks = Math.round(0.25 * sampleRate / 128);                          // stay open 0.25 s after the last loud moment
    this.bb = Math.max(1, Math.round(sampleRate / 128)); this.bc = 0; this.bm = 1;  // background = the quietest level seen in the last ~5 seconds (5 buckets of 1 s)
    this.mins = new Float32Array(5).fill(1); this.mi = 0;
    this.port.onmessage = e => {
      const m = e.data || {};
      if (m.margin != null) this.margin = m.margin;
      if (m.floorGain != null) this.floorGain = m.floorGain;
      if (m.abs != null) this.abs = m.abs;                                          // a fixed threshold picked by the person (Settings → Mic threshold); 0 = learn it automatically
      if (m.on != null) { this.on = !!m.on; if (!this.on) this.g = 1; }
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0], out = outputs[0];
    if (!inp || !out || !out[0]) return true;                                       // nothing connected yet: stay silent
    const n = inp.length, o0 = out[0];
    let s = 0; for (let i = 0; i < n; i++) s += inp[i] * inp[i];
    const rms = Math.sqrt(s / n);
    this.env = rms > this.env ? rms : this.env * 0.92 + rms * 0.08;                 // fast attack, ~30 ms release
    if (this.env < this.bm) this.bm = this.env;
    if (++this.bc >= this.bb) { this.bc = 0; this.mins[this.mi] = this.bm; this.mi = (this.mi + 1) % this.mins.length; this.bm = 1; }
    let floor = this.bm; for (let k = 0; k < this.mins.length; k++) if (this.mins[k] < floor) floor = this.mins[k];
    floor = Math.max(floor, 0.0005);
    const thr = this.abs > 0 ? this.abs : Math.min(Math.max(floor * this.margin, 0.003), 0.15);   // automatic: never so strict that a loud room locks you out
    if (this.env > thr) this.hold = this.holdBlocks; else if (this.hold > 0) this.hold--;
    const open = !this.on || this.hold > 0; if (open !== this.lastOpen) { this.lastOpen = open; this.port.postMessage({ open }); }   // lets the meter show when the mic is cut
    const target = !this.on || this.hold > 0 ? 1 : this.floorGain, g0 = this.g;
    this.g += (target - this.g) * (target > this.g ? 0.5 : 0.04);                  // opens in ~6 ms, closes over ~70 ms
    for (let i = 0; i < n; i++) {
      const x = inp[i], y = this.d[this.p]; this.d[this.p] = x; this.p = (this.p + 1) % this.L;
      o0[i] = this.on ? y * (g0 + (this.g - g0) * (i + 1) / n) : x;
    }
    for (let c = 1; c < out.length; c++) out[c].set(o0);
    return true;
  }
}
registerProcessor('karaoke-gate', KaraokeGate);
