// ---- fullscreen lyrics: the whole page goes fullscreen (so the YouTube player stays alive in a corner), the stage fills the screen,
// and the controls you may need while singing move into a floating bar that hides itself when idle.
(() => {
  const B = document.body, root = document.documentElement, Q = s => document.querySelector(s);
  const stage = Q('#stage'), bar = Q('#fsbar'), btn = Q('#fsBtn');
  if (!stage || !bar || !btn) return;
  const moved = [];                                   // [row, placeholder]: where each control came from, so it can go back
  const pick = ['#tmRow', '#finRow', '#sRow', '#rvRow', '#vcMute'];
  let idleT = 0, wake = null;
  const isFs = () => B.classList.contains('fs');
  const native = () => document.fullscreenElement || document.webkitFullscreenElement;
  const stageOn = () => stage.style.display !== 'none' && getComputedStyle(stage).display !== 'none';
  function nudge() { B.classList.remove('fs-idle'); clearTimeout(idleT); idleT = setTimeout(() => B.classList.add('fs-idle'), 3000); }
  async function enter() {
    if (isFs() || !stageOn()) return;
    pick.map(Q).filter(Boolean).forEach(r => { const ph = document.createComment('fs'); r.replaceWith(ph); bar.insertBefore(r, Q('#fsGear')); moved.push([r, ph]); });
    B.classList.add('fs'); nudge(); btn.textContent = '⛶ Exit fullscreen';
    try { const f = root.requestFullscreen || root.webkitRequestFullscreen; if (f) await f.call(root); } catch (e) {}     // phones without the API still get the full-page layout
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) {}                        // keep the screen awake while singing
  }
  function leave() {
    if (!isFs()) return;
    B.classList.remove('fs', 'fs-idle'); clearTimeout(idleT); btn.textContent = '⛶ Fullscreen';
    moved.splice(0).forEach(([r, ph]) => ph.replaceWith(r));
    try { if (native()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {}
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    try { if (wake) wake.release(); } catch (e) {} wake = null;
  }
  const toggle = () => isFs() ? leave() : enter();
  btn.onclick = toggle; Q('#fsExit').onclick = leave; Q('#fsGear').onclick = () => Q('#gear').click();
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => { if (!native()) leave(); }));   // Esc or the browser's own exit
  new MutationObserver(() => { if (isFs() && stage.style.display === 'none') leave(); }).observe(stage, { attributes: true, attributeFilter: ['style'] });   // "Back to the queue" leaves the stage
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (isFs() && !native()) leave(); return; }
    const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && (isFs() || stageOn())) { e.preventDefault(); toggle(); }
  });
  ['mousemove', 'pointerdown', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, () => { if (isFs()) nudge(); }, { passive: true }));
  document.addEventListener('visibilitychange', async () => { if (isFs() && !document.hidden && navigator.wakeLock) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) {} } });
})();
