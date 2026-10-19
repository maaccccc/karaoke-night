// ---- Guess the Lyrics: a room game for 2 or more people.
// A lyric line is shown with one word missing. Type the word: faster answers score more.
// The server holds the answers and checks every guess, so nobody can peek.
(function () {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'css/lyric-game.css'; document.head.appendChild(css);
  const TOTAL = { intro: 4, reveal: 5 };
  let st = null, tmr = 0, shown = '';
  const nowS = () => Date.now() + (room.skew || 0);

  // ---- entry card on the home page (only visible inside a room)
  const card = el('div', null, 'card'); card.id = 'cLg';
  card.innerHTML = '<h2>🎯 Guess the Lyrics</h2>' +
    '<p class="note">Everyone sees a lyric line with one word missing. Type it before the others do. Needs 2 or more people in the room.</p>' +
    '<div class="row"><input id="lgq" placeholder="Pick a song for the game" maxlength="80" aria-label="Search a song for Guess the Lyrics"><button id="lgSearch">Search</button></div>' +
    '<div id="lgres"></div><p class="note" id="lgNote" aria-live="polite" style="margin:8px 0 0"></p>' +
    '<div class="row" style="margin-top:8px"><button class="ghost" id="lgReopen" style="display:none">Open the game</button></div>';
  const home = $('#home'); const anchor = $('#cImport');
  if (home) home.insertBefore(card, anchor || null); else document.body.appendChild(card);
  const note = t => { $('#lgNote').textContent = t || ''; };

  // ---- the game window
  const dlg = el('div'); dlg.id = 'lgdlg'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-labelledby', 'lgH');
  dlg.innerHTML = '<div class="box">' +
    '<div class="lgtop"><b id="lgH">🎯 Guess the Lyrics</b><span id="lgRound"></span><button class="ghost mini" id="lgX" aria-label="Hide the game window">✕</button></div>' +
    '<p class="note" id="lgSong"></p>' +
    '<div id="lgBar"><i></i></div><p id="lgLeft" class="note"></p>' +
    '<div id="lgLine" aria-live="polite"></div>' +
    '<div class="row" id="lgForm"><input id="lgIn" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the missing word" aria-label="Your guess"><button id="lgGo">Guess</button></div>' +
    '<p class="note" id="lgFb" aria-live="polite"></p>' +
    '<div id="lgPeople"></div>' +
    '<div class="row" id="lgBtns"><button class="ghost" id="lgStop">End game</button></div></div>';
  document.body.appendChild(dlg);

  // ---- search + start
  async function search() {
    const q = $('#lgq').value.trim(); if (q.length < 2) return;
    const box = $('#lgres'); box.textContent = ''; note('Searching…');
    try {
      const r = await fetch('/api/search?q=' + encodeURIComponent(q)); const list = await r.json(); if (!r.ok) throw new Error(list.error);
      note(list.length ? 'Pick the song to play with.' : 'No songs found. Try different words.');
      list.slice(0, 8).forEach(s => {
        const row = el('div', null, 'item'), info = el('div'); info.append(el('span', s.title), el('small', s.artist));
        const go = el('button', 'Play'); go.onclick = () => start(s, go); row.append(info, go); box.appendChild(row);
      });
    } catch (e) { note('Search failed: ' + e.message); }
  }
  async function start(s, btn) {
    btn.disabled = true; note('Getting the lyrics for “' + s.title + '”…');
    try {
      await rpost('/api/lg/start', { room: room.code, id: room.id, song: { title: s.title, artist: s.artist, duration: s.duration } });
      note(''); $('#lgres').textContent = '';
    } catch (e) { note(e.message); }
    btn.disabled = false;
  }
  $('#lgSearch').onclick = search;
  $('#lgq').onkeydown = e => { if (e.key === 'Enter') search(); };
  $('#lgReopen').onclick = () => open();
  $('#lgX').onclick = () => dlg.classList.remove('show');
  $('#lgStop').onclick = () => { if (st && st.phase !== 'final') roomOp({ op: 'lg_stop' }); else dlg.classList.remove('show'); };

  // ---- guessing
  function guess() {
    const inp = $('#lgIn'), t = inp.value.trim(); if (!t || !st || st.phase !== 'round') return;
    roomOp({ op: 'lg_guess', text: t }); inp.value = ''; inp.focus();
  }
  $('#lgGo').onclick = guess;
  $('#lgIn').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); guess(); } };
  function wrong() {
    const fb = $('#lgFb'); fb.textContent = 'Not it. Try again!'; fb.classList.remove('shake'); void fb.offsetWidth; fb.classList.add('shake');
  }

  // ---- messages from the server
  const prevHandle = handleMsg;
  handleMsg = function (m) {
    if (m.type === 'lg') return onGame(m);
    if (m.type === 'lgwrong') return wrong();
    return prevHandle(m);
  };
  function onGame(m) {
    const prev = st; st = m;
    $('#lgReopen').style.display = m.phase === 'none' ? 'none' : '';
    $('#lgReopen').textContent = m.phase === 'final' ? 'See the results' : 'Open the game';
    if (m.phase === 'none') { dlg.classList.remove('show'); return; }
    const fresh = !prev || prev.phase === 'none' || prev.phase === 'final';
    if (fresh && m.phase !== 'final') {
      if (typeof active !== 'undefined' && active) say('A Guess the Lyrics game started. Open it from the Guess the Lyrics card when your song is over.');
      else open();
    }
    const key = m.phase + ':' + m.n;
    if (key !== shown) { shown = key; $('#lgIn').value = ''; $('#lgFb').textContent = ''; if (m.phase === 'round') setTimeout(() => $('#lgIn').focus(), 50); }
    draw(); clock();
  }
  function open() { if (!st || st.phase === 'none') return; dlg.classList.add('show'); draw(); clock(); }

  function draw() {
    const m = st; if (!m || m.phase === 'none') return;
    const me = m.solved && m.solved[room.name] != null;
    $('#lgRound').textContent = m.phase === 'final' ? 'Results' : m.phase === 'intro' ? 'Get ready' : 'Round ' + m.n + ' of ' + m.of;
    $('#lgSong').textContent = m.song.title + ' by ' + m.song.artist + ' (started by ' + m.host + ')';
    const line = $('#lgLine'); line.textContent = ''; line.className = m.phase;
    if (m.phase === 'intro') line.appendChild(el('span', 'The first line is coming up…', 'lgmsg'));
    else if (m.phase === 'round' || m.phase === 'reveal') {
      line.appendChild(document.createTextNode(m.pre));
      if (m.phase === 'reveal') line.appendChild(el('b', m.answer, 'lgans'));
      else { const bl = el('span', null, 'lgblank'); for (let i = 0; i < m.len; i++) bl.appendChild(el('i', i === 0 && m.hint ? m.hint : '')); line.appendChild(bl); }
      line.appendChild(document.createTextNode(m.post));
    } else {
      const top = Math.max(0, ...Object.values(m.scores || {})), win = Object.keys(m.scores || {}).filter(n => m.scores[n] === top);
      line.appendChild(el('span', top > 0 ? '🏆 ' + win.join(' & ') + (win.length > 1 ? ' tie with ' : ' wins with ') + top + ' points' : 'Nobody scored this time', 'lgmsg'));
      if (m.note) line.appendChild(el('small', m.note, 'lgnote'));
    }
    $('#lgForm').style.display = m.phase === 'round' && !me ? '' : 'none';
    if (m.phase === 'round' && me) $('#lgFb').textContent = '✅ Correct! +' + m.solved[room.name] + ' points. Waiting for the others…';
    if (m.phase === 'reveal' && !me) $('#lgFb').textContent = 'Time is up. The word was “' + m.answer + '”.';
    if (m.phase === 'reveal' && me) $('#lgFb').textContent = '✅ You got it: +' + m.solved[room.name] + ' points.';
    $('#lgStop').textContent = m.phase === 'final' ? 'Close' : 'End game';
    const names = [...new Set([...(m.players || []), ...Object.keys(m.scores || {})])].sort((a, b) => (m.scores[b] || 0) - (m.scores[a] || 0));
    const box = $('#lgPeople'); box.textContent = '';
    names.forEach(n => {
      const row = el('div', null, 'lgp' + (n === room.name ? ' me' : '')), got = m.solved && m.solved[n] != null;
      row.append(el('span', avTxt(n) + n + (n === room.name ? ' (you)' : '')),
        el('em', got && (m.phase === 'round' || m.phase === 'reveal') ? (m.phase === 'round' ? '✓ got it' : '+' + m.solved[n]) : ''),
        el('b', String(m.scores[n] || 0)));
      box.appendChild(row);
    });
  }

  function clock() {
    clearInterval(tmr);
    if (!st || !['intro', 'round', 'reveal'].includes(st.phase)) { $('#lgBar i').style.width = '0'; $('#lgLeft').textContent = ''; return; }
    const total = (st.phase === 'round' ? st.secs : TOTAL[st.phase]) * 1000;
    const step = () => {
      const left = Math.max(0, st.ends - nowS());
      $('#lgBar i').style.width = Math.min(100, left / total * 100) + '%'; $('#lgLeft').textContent = Math.ceil(left / 1000) + 's';
    };
    step(); tmr = setInterval(step, 100);
  }
})();
