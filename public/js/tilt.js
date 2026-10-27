// ---- PC-only depth: the three big cards tilt towards the mouse and the background drifts a little.
// Does nothing on touch screens, with "reduce motion", in smooth mode (body.lite) or on narrow windows, so phones pay nothing for it.
(() => {
  const fine = matchMedia('(hover:hover) and (pointer:fine)'), calm = matchMedia('(prefers-reduced-motion:reduce)'), wide = matchMedia('(min-width:900px)');
  const B = document.body, on = () => fine.matches && !calm.matches && wide.matches && !B.classList.contains('lite');
  let raf = 0, px = 0, py = 0;
  addEventListener('pointermove', e => {                         // background parallax, one cheap update per frame
    if (!on() || e.pointerType !== 'mouse') return;
    px = e.clientX / innerWidth - .5; py = e.clientY / innerHeight - .5;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const b = document.querySelector('.bg'); if (!b) return; const s = b.style; s.setProperty('--px', px.toFixed(3)); s.setProperty('--py', py.toFixed(3)); });
  }, { passive: true });
  const MAX = 7;                                                  // degrees
  document.querySelectorAll('.lact').forEach(c => {
    c.addEventListener('pointermove', e => {
      if (!on() || e.pointerType !== 'mouse') return;
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      c.classList.add('tilting');
      c.style.setProperty('--ry', ((x - .5) * 2 * MAX).toFixed(2) + 'deg'); c.style.setProperty('--rx', ((.5 - y) * 2 * MAX).toFixed(2) + 'deg');
      c.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); c.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    });
    c.addEventListener('pointerleave', () => { c.classList.remove('tilting'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); });
  });
})();
