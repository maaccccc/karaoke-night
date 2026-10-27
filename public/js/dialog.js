// Themed replacements for the browser's confirm() / alert() / prompt() boxes, so questions look like the rest of the site (and never show the
// browser's or the desktop app's own title bar text). Usage:
//   if (await kConfirm('Message', { title, ok, cancel, danger })) ...      await kAlert('Message', { title, ok })
//   const name = await kPrompt('Message', { title, ok, value, placeholder, max })   -> text, or null when cancelled
//   const id = await kPick('Message', { title, choices: [{ label, value }] })        -> the chosen value, or null when cancelled
// Built on <dialog>.showModal(), so it sits above everything, also in fullscreen. Esc or a click outside = Cancel. Boxes are queued, one at a time.
(() => {
  let dlg = null, tEl, mEl, inEl, pkEl, okB, noB, chain = Promise.resolve();
  const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  function build() {
    if (dlg) return;
    dlg = mk('dialog', 'kdlg'); dlg.setAttribute('aria-labelledby', 'kdT'); dlg.setAttribute('aria-describedby', 'kdM');
    tEl = mk('h2'); tEl.id = 'kdT'; mEl = mk('p'); mEl.id = 'kdM';
    inEl = mk('input', 'kdin'); inEl.type = 'text'; inEl.autocomplete = 'off'; inEl.setAttribute('aria-labelledby', 'kdM');
    pkEl = mk('div', 'kdpick');
    const row = mk('div', 'row kdrow');
    okB = mk('button'); okB.type = 'button'; noB = mk('button', 'ghost'); noB.type = 'button';
    row.append(okB, noB); dlg.append(tEl, mEl, inEl, pkEl, row); document.body.appendChild(dlg);
  }
  function show(mode, msg, o) {
    const cancelVal = mode === 'confirm' ? false : mode === 'alert' ? true : null;
    return new Promise(done => {
      if (!window.HTMLDialogElement || !document.body) {
        done(mode === 'confirm' ? window.confirm(msg) : mode === 'alert' ? (window.alert(msg), true) : mode === 'prompt' ? window.prompt(msg, o.value || '') : null); return;
      }
      build();
      const back = document.activeElement, ask = mode === 'prompt', pick = mode === 'pick';
      tEl.textContent = o.title || (mode === 'alert' ? 'Heads up' : mode === 'confirm' ? 'Are you sure?' : 'Karaoke Night'); mEl.textContent = msg;
      okB.textContent = o.ok || 'OK'; okB.className = o.danger ? 'kd-danger' : ''; okB.style.display = pick ? 'none' : '';
      noB.textContent = o.cancel || 'Cancel'; noB.style.display = mode === 'alert' ? 'none' : '';
      inEl.style.display = ask ? '' : 'none'; inEl.value = ask ? String(o.value || '') : ''; inEl.maxLength = o.max || 60; inEl.placeholder = o.placeholder || '';
      pkEl.textContent = ''; pkEl.style.display = pick ? '' : 'none';
      let over = false;
      const finish = v => {
        if (over) return; over = true;
        okB.onclick = noB.onclick = dlg.onclick = dlg.oncancel = inEl.onkeydown = null;
        try { dlg.close(); } catch (e) {}
        try { if (back && back.focus && document.contains(back)) back.focus(); } catch (e) {}
        done(v);
      };
      const accept = () => { if (ask) { const v = inEl.value.trim(); if (!v) { inEl.focus(); return; } finish(v); } else finish(true); };
      okB.onclick = accept; noB.onclick = () => finish(cancelVal);
      inEl.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); accept(); } };
      if (pick) (o.choices || []).forEach(c => { const b = mk('button', 'ghost'); b.type = 'button'; b.textContent = c.label; b.onclick = () => finish(c.value); pkEl.appendChild(b); });
      dlg.oncancel = e => { e.preventDefault(); finish(cancelVal); };                                          // Esc
      dlg.onclick = e => { const r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(cancelVal); };   // backdrop
      try { dlg.showModal(); } catch (e) { finish(cancelVal); return; }
      // focus: text box for a name, first choice for a list, Cancel for a destructive question (a stray Enter must not confirm it), otherwise the main button
      (ask ? inEl : pick ? (pkEl.firstChild || noB) : (o.danger && mode === 'confirm') ? noB : okB).focus(); if (ask) inEl.select();
    });
  }
  const queue = fn => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };
  window.kConfirm = (msg, o) => queue(() => show('confirm', msg, o || {}));
  window.kAlert = (msg, o) => queue(() => show('alert', msg, o || {})).then(() => {});
  window.kPrompt = (msg, o) => queue(() => show('prompt', msg, o || {}));
  window.kPick = (msg, o) => queue(() => show('pick', msg, o || {}));
})();
