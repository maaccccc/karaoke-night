// ---- premium layer: a real 3D microphone you can spin, drifting light dust, sparks. Visual only; nothing here touches the app's data.
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches, Q = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const css = n => getComputedStyle(document.body).getPropertyValue(n).trim();
  const rgb = h => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 61, 139]; };

  // ===== light dust + sparks =====
  const cv = Q('#fxDust'), cx = cv.getContext('2d'); let W = 0, H = 0, dpr = 1, parts = [], sparks = [], pal = [[255, 61, 139], [53, 224, 255], [255, 200, 61]], dim = 1;
  function size() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  const mk = (anywhere) => ({ x: Math.random() * W, y: anywhere ? Math.random() * H : H + 20, r: 1.2 + Math.random() * 4, vy: -(7 + Math.random() * 18), vx: (Math.random() - .5) * 8, ph: Math.random() * 6.3, c: Math.floor(Math.random() * 3), a: .18 + Math.random() * .5 });
  function seed() { parts = []; if (RM) return; for (let i = 0, n = Math.round(clamp(W / 34, 12, 40)); i < n; i++) parts.push(mk(true)); }
  window.fxBurst = (x, y, n, col) => { if (RM) return; for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, s = 60 + Math.random() * 220; sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 1, c: col || pal[Math.floor(Math.random() * 3)] }); } if (sparks.length > 160) sparks.splice(0, sparks.length - 160); };
  function drawFx(dt, t) {
    cx.clearRect(0, 0, W, H); cx.globalCompositeOperation = 'lighter';
    parts.forEach(p => {
      p.y += p.vy * dt; p.x += (p.vx + Math.sin(t / 1800 + p.ph) * 10) * dt;
      if (p.y < -20) Object.assign(p, mk(false)); const c = pal[p.c], tw = .6 + .4 * Math.sin(t / 700 + p.ph), al = p.a * tw * dim;
      cx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${al * .16})`; cx.beginPath(); cx.arc(p.x, p.y, p.r * 3.2, 0, 6.3); cx.fill();
      cx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${al})`; cx.beginPath(); cx.arc(p.x, p.y, p.r * .7, 0, 6.3); cx.fill();
    });
    sparks = sparks.filter(s => (s.life -= dt * 1.4) > 0);
    sparks.forEach(s => { s.vy += 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt; cx.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${s.life * .9})`; cx.beginPath(); cx.arc(s.x, s.y, 1 + s.life * 2.2, 0, 6.3); cx.fill(); });
  }

  // ===== the microphone: a wire-mesh globe on a faceted chrome handle with gold collars, lit per face as it turns =====
  function prism(parent, R, y, h, N, kind) {
    const faces = [], w = 2 * R * Math.tan(Math.PI / N) + .9;
    for (let i = 0; i < N; i++) {
      const f = document.createElement('i'); f.className = 'fc'; const th = i * 360 / N;
      f.style.cssText = `left:${-w / 2}px;top:${y}px;width:${w}px;height:${h}px;transform:rotateY(${th}deg) translateZ(${R}px);`;
      parent.appendChild(f); faces.push({ f, th });
    }
    return { faces, kind };
  }
  function shade(p, a) {       // light from the upper left; gold gets a hot specular streak
    p.faces.forEach(o => {
      const w = (o.th + a) * Math.PI / 180, facing = Math.cos(w); if (facing < -.05) return;
      const b = Math.max(0, Math.cos(w + .62)), rim = Math.pow(Math.max(0, Math.cos(w - 1.25)), 3), spec = Math.pow(b, 14);
      o.f.style.background = p.kind === 'gold'
        ? `hsl(${42 - spec * 6} ${88 - spec * 40}% ${13 + b * 42 + spec * 26 + rim * 8}%)`
        : `hsl(${262 + rim * 50} ${14 + rim * 40}% ${5 + b * 21 + spec * 34 + rim * 16}%)`;
    });
  }
  function buildMic(root, mini) {
    const mic = root.querySelector('.mic'), spin = document.createElement('div'); spin.className = 'spin';
    const D = 150, cy = 85, lw = mini ? 9 : 2, core = document.createElement('div'); core.className = 'core'; core.style.cssText = `left:${-D / 2}px;top:${cy - D / 2}px;width:${D}px;height:${D}px`; mic.appendChild(core);
    [-60, -30, 0, 30, 60].forEach(ph => { const r = D / 2 * Math.cos(ph * Math.PI / 180), d = document.createElement('i'); d.className = 'wire'; d.style.cssText = `left:${-r}px;top:${cy - D / 2 * Math.sin(ph * Math.PI / 180) - r}px;width:${2 * r}px;height:${2 * r}px;border-width:${lw}px;transform:rotateX(90deg)`; mic.appendChild(d); });
    for (let i = 0; i < (mini ? 6 : 10); i++) { const d = document.createElement('i'); d.className = 'wire'; d.style.cssText = `left:${-D / 2}px;top:${cy - D / 2}px;width:${D}px;height:${D}px;border-width:${lw}px;transform:rotateY(${i * (mini ? 30 : 18)}deg)`; spin.appendChild(d); }
    const N = mini ? 10 : 16, parts = [prism(spin, 50, 156, 26, N, 'gold'), prism(spin, 31, 180, 130, N, 'dark'), prism(spin, 34, 212, 9, N, 'gold'), prism(spin, 34, 262, 9, N, 'gold'), prism(spin, 37, 306, 14, N, 'gold')];
    mic.appendChild(spin); return { spin, parts };
  }
  const mics = []; window.premiumMics = mics;
  function addMic(root, mini) {
    const m = { root, mini, a: Math.random() * 360, pa: 0, v: 0, dragging: false, lx: 0, lt: 0, parts: null, k: 1 };
    Object.assign(m, buildMic(root, mini));
    const sc = () => { m.k = root.clientHeight / 360; root.querySelector('.mic').style.transform = `rotateZ(-11deg) rotateX(-9deg) scale(${m.k})`; };
    sc(); addEventListener('resize', sc); m.sc = sc;
    root.addEventListener('pointerdown', e => { m.dragging = true; m.lx = e.clientX; m.lt = e.timeStamp; root.classList.add('touched'); try { root.setPointerCapture(e.pointerId); } catch (x) {} });
    root.addEventListener('pointermove', e => { if (!m.dragging) return; const dx = e.clientX - m.lx, dt = Math.max(1, e.timeStamp - m.lt); m.a += dx * .9; m.lx = e.clientX; m.lt = e.timeStamp; });
    ['pointerup', 'pointercancel'].forEach(n => root.addEventListener(n, () => { m.dragging = false; }));
    root.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); m.v += (m.v < 0 ? -1 : 1) * 700; root.classList.add('touched'); } });
    mics.push(m); return m;
  }
  const hero = addMic(Q('#micHero'), false);
  const mini = document.createElement('span'); mini.className = 'mic3d mini'; mini.setAttribute('aria-hidden', 'true'); mini.innerHTML = '<div class="mglow"></div><div class="scene"><div class="mic"></div></div>';
  const top = Q('header.top'); if (top) top.prepend(mini); const miniM = top ? addMic(mini, true) : null;

  // ===== one loop for everything =====
  let last = performance.now(), ds = [], judged = false;   // localStorage.karaokeLite = '1' forces lite mode, '0' forces the full look, otherwise it is decided automatically
  try { const f = localStorage.getItem('karaokeLite'); if (f === '1') document.body.classList.add('lite'); if (f === '0' || f === '1') judged = true; } catch (e) {}
  function frame(now) {
    const raw = (now - last) / 1000; const dt = Math.min(.05, raw); last = now;
    if (!judged && now > 2500) { ds.push(raw); if (ds.length >= 40) { judged = true; ds.sort((a, b) => a - b); if (ds[20] > 1 / 26) { document.body.classList.add('lite'); } } }
    let live = false; try { live = !!active; } catch (e) {}
    mics.forEach(m => {
      if (!m.root.getClientRects().length) return;
      const idle = RM ? 0 : m.mini ? (live ? 130 : 22) : 26;
      if (m.dragging) m.v += (clamp((m.a - m.pa) / dt, -3000, 3000) - m.v) * .4;      // while dragging, speed = how fast your hand moved it
      else { m.v += (idle - m.v) * (1 - Math.exp(-dt * .8)); m.a += m.v * dt; }       // after release it keeps its speed and slowly coasts back to idle
      m.pa = m.a; m.spin.style.transform = `rotateY(${m.a}deg)`;
      m.parts.forEach(p => shade(p, m.a));
      const sp = clamp((Math.abs(m.v) - idle) / 900, 0, 1); m.root.style.setProperty('--spd', sp.toFixed(3));
      m.root.classList.toggle('fast', Math.abs(m.v) > 240); m.root.classList.toggle('live', m.mini && live);
      if (!m.mini) { const r = m.root.querySelector('.rpm'); if (Math.abs(m.v) > 240) r.textContent = Math.round(Math.abs(m.v) / 6) + ' RPM'; }
      if (Math.abs(m.v) > 420 && Math.random() < dt * 26 * clamp(Math.abs(m.v) / 1500, .3, 1.5)) { const b = m.root.getBoundingClientRect(); window.fxBurst(b.left + b.width / 2 + (Math.random() - .5) * b.width * .5, b.top + b.height * (m.mini ? .5 : .25), m.mini ? 1 : 3); }
    });
    drawFx(dt, now); requestAnimationFrame(frame);
  }
  // slow housekeeping: theme colours for the dust, calmer background while a song is on stage
  setInterval(() => {
    pal = [rgb(css('--pink')), rgb(css('--cyan')), rgb(css('--gold'))];
    const st = Q('#stage'); dim = st && getComputedStyle(st).display !== 'none' ? .35 : 1;
    mics.forEach(m => m.sc && m.sc());
  }, 1500);
  addEventListener('resize', () => { size(); seed(); }); size(); seed(); requestAnimationFrame(frame);
})();
