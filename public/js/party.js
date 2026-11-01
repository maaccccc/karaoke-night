// party.js: the little bits of motion that need JavaScript (see css/party.css). Does nothing in Smooth mode or with "reduce motion".
(function () {
  const B = document.body, reduce = matchMedia('(prefers-reduced-motion:reduce)');
  const calm = () => B.classList.contains('lite') || reduce.matches;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- drifting notes behind the page (they are placed inside the .bg layer)
  const bg = document.querySelector('.bg');
  if (bg && !reduce.matches) {
    const glyphs = ['♪', '♫', '♩', '♬', '🎵', '🎶'], cols = ['#ff3d8b', '#35e0ff', '#ffc83d', '#a83dff', '#4dff9b'];
    const n = matchMedia('(max-width:700px)').matches ? 5 : 9;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span'); s.className = 'pnote'; s.textContent = glyphs[i % glyphs.length]; s.setAttribute('aria-hidden', 'true');
      s.style.cssText = '--x:' + (4 + i * (88 / n) + rnd(0, 6)).toFixed(1) + '%;--s:' + rnd(22, 48).toFixed(0) + 'px;--d:' + rnd(15, 27).toFixed(1) + 's;--w:-' + rnd(0, 22).toFixed(1) + 's;--c:' + cols[i % cols.length] + ';--sway:' + rnd(-70, 70).toFixed(0) + 'px';
      bg.appendChild(s);
    }
  }

  // ---- home page: pieces appear one after another (after the curtains if they are playing)
  const land = document.getElementById('landing');
  if (land) {
    B.style.setProperty('--pbase', document.querySelector('.curtain-open') ? '1.9s' : '.05s');
    Array.from(land.children).forEach((c, i) => c.style.setProperty('--i', i));
    setTimeout(() => B.style.setProperty('--pbase', '.05s'), 4500);     // coming back to the home page later should not wait for curtains
  }

  // ---- buttons: ripple where you press, jelly wobble + sparkle burst when you click
  document.addEventListener('pointerdown', e => {
    if (calm()) return;
    const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled || b.id === 'vcHead' || b.classList.contains('seg')) return;
    const r = b.getBoundingClientRect(); b.style.setProperty('--rx', (e.clientX - r.left) + 'px'); b.style.setProperty('--ry', (e.clientY - r.top) + 'px');
    const fix = getComputedStyle(b).position === 'static'; if (fix) b.style.position = 'relative';     // the ripple is a pseudo-element, so the button must be a positioning parent
    b.classList.remove('prip'); void b.offsetWidth; b.classList.add('prip');
    clearTimeout(b._pt); b._pt = setTimeout(() => { b.classList.remove('prip'); if (fix) b.style.position = ''; }, 650);
  }, { passive: true });

  let fx = null, lastBurst = 0;
  function burst(x, y) {
    const now = Date.now(); if (now - lastBurst < 300) return; lastBurst = now;
    if (!fx) { fx = document.createElement('div'); fx.id = 'partyFx'; fx.setAttribute('aria-hidden', 'true'); document.body.appendChild(fx); }
    const em = ['🎵', '🎶', '✨', '⭐', '💖', '🎤'];
    for (let i = 0; i < 7; i++) {
      const p = document.createElement('i'), a = rnd(0, Math.PI * 2), d = rnd(50, 110);
      p.textContent = em[(Math.random() * em.length) | 0]; p.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--dx:' + (Math.cos(a) * d).toFixed(0) + 'px;--dy:' + (Math.sin(a) * d - 30).toFixed(0) + 'px;--rot:' + rnd(-50, 50).toFixed(0) + 'deg';
      fx.appendChild(p); setTimeout(() => p.remove(), 900);
    }
  }
  document.addEventListener('click', e => {
    if (calm()) return;
    const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled) return;
    b.classList.remove('pjel'); void b.offsetWidth; b.classList.add('pjel'); setTimeout(() => b.classList.remove('pjel'), 450);
    if (b.matches('.lbtn,#startBtn,.addSongsBtn,button:not(.ghost):not(.mini):not(.seg):not(.icon)')) {
      const r = b.getBoundingClientRect(); burst(e.detail ? e.clientX : r.left + r.width / 2, e.detail ? e.clientY : r.top + r.height / 2);   // keyboard "clicks" have no mouse position
    }
  });

  // ---- new rows in a list drop in once (the lists are rebuilt on every change, so remember what was already there)
  function watchList(id) {
    const box = document.getElementById(id); if (!box) return;
    const rows = () => Array.from(box.children).filter(c => !c.classList.contains('note'));
    const key = n => n.textContent.replace(/^\d+/, '').trim();
    let prev = new Set(rows().map(key));
    new MutationObserver(() => {
      const cur = rows(); let k = 0;
      if (!calm()) cur.forEach(n => { if (!prev.has(key(n))) { n.style.setProperty('--i', k++); n.classList.add('fresh'); } });
      prev = new Set(cur.map(key));
    }).observe(box, { childList: true });
  }
  watchList('queue'); watchList('sideQ');

  // ---- "Now singing": live dot + dancing bars; score bumps when it goes up
  const now = document.getElementById('nowBox');
  if (now) {
    const card = now.closest('.card'), h2 = card && card.querySelector(':scope > h2'); let lastBump = 0, lastPts = 0;
    new MutationObserver(() => {
      const sc = document.getElementById('nowScore'), live = !!sc;
      if (card) card.classList.toggle('nowlive', live);
      if (h2) { const has = h2.querySelector('.peq'); if (live && !has) { const q = document.createElement('span'); q.className = 'peq'; q.setAttribute('aria-hidden', 'true'); q.innerHTML = '<i></i><i></i><i></i><i></i>'; h2.appendChild(q); } else if (!live && has) has.remove(); }
      if (!sc) { lastPts = 0; return; }
      const pts = parseInt(sc.textContent, 10) || 0, t = Date.now();
      if (pts > lastPts + 4 && t - lastBump > 500 && !calm()) { lastBump = t; sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
      lastPts = pts;
    }).observe(now, { childList: true, subtree: true, characterData: true });
  }

  // ---- scoreboard: a score that changed bumps
  const sb = document.getElementById('sideScores');
  if (sb) {
    let prev = {};
    new MutationObserver(() => {
      const cur = {};
      Array.from(sb.querySelectorAll('.sc')).forEach(r => {
        const nm = r.firstChild && r.firstChild.textContent, b = r.querySelector('b'); if (!nm || !b) return;
        cur[nm] = b.textContent; if (prev[nm] !== undefined && prev[nm] !== cur[nm] && !calm()) b.classList.add('bump');
      });
      prev = cur;
    }).observe(sb, { childList: true });
  }
})();
