// Sing-along / Karaoke toggle. The hidden #karOn checkbox stays the source of truth (prefs.kar, queue switching),
// so these buttons just set it and fire its normal "change" event.
(function () {
  const box = document.getElementById('karOn'), sing = document.getElementById('segSing'), kar = document.getElementById('segKar');
  if (!box || !sing || !kar) return;
  function sync() { sing.setAttribute('aria-pressed', String(!box.checked)); kar.setAttribute('aria-pressed', String(box.checked)); }
  window.syncKarMode = sync;
  function pick(on) { if (box.checked === on) return; box.checked = on; box.dispatchEvent(new Event('change', { bubbles: true })); sync(); }
  sing.addEventListener('click', () => pick(false));
  kar.addEventListener('click', () => pick(true));
  box.addEventListener('change', sync);
  sync();
  // "How to fix the timing" opens the guide straight on "Lyrics out of sync?"
  document.querySelectorAll('[data-help-sync]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const dlg = document.getElementById('helpdlg'), d = document.getElementById('hlSync'); if (!dlg || !dlg.showModal) return;
    if (!dlg.open) dlg.showModal();
    if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); }
  }));
})();
