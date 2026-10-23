// ---- awards after each song, a podium after tournaments, and the end-of-night screen
let awData = { list: [] }; const hist = [];
function setAwData(m) { awData = { list: (m.results || [m]).map(x => ({ name: x.name, pts: x.pts, parts: x.parts || {}, hasMic: !!x.hasMic, combo: x.combo || { max: 0, bonus: 0 } })) }; }
const pctOf = (p, k) => (p[k] || 0) / MAXP[k];
function awardsFor(r, ctx) {         // funny titles from the score breakdown, the combo, the audience stars and the reactions
  const p = r.parts, si = pctOf(p, 'Singing'), to = pctOf(p, 'Tone'), vo = pctOf(p, 'Volume'), ti = pctOf(p, 'Timing'), cm = (r.combo || {}).max || 0, out = [];
  const add = (icon, title, why, s) => out.push({ icon, title, why, s }), pc = x => Math.round(x * 100) + '%';
  if (r.pts >= 95) add('🏆', 'Perfect Performance', 'A near-flawless ' + r.pts + ' out of 100', 1);
  if (to >= .85) add('🎯', 'Pitch Perfect', 'Tone ' + pc(to), to);
  if (vo >= .9) add('📣', 'Strong Voice', 'Clear and steady, ' + pc(vo), vo * .9);
  if (ti >= .9) add('⏱️', 'Always Early', 'On time for ' + pc(ti) + ' of the lines', ti * .9);
  if (si >= .9) add('🎶', 'Non-Stop Singer', 'Sang ' + pc(si) + ' of every line', si * .9);
  if (cm >= 8) add('🔥', 'Combo Machine', 'Best streak: ' + cm + ' lines in a row', .8 + Math.min(.15, cm / 100));
  if ((ctx.stars.n && ctx.stars.avg >= 4.3) || ctx.reacts >= 10) add('💖', 'Crowd Favourite', ctx.stars.n ? 'Audience ★ ' + ctx.stars.avg : ctx.reacts + ' reactions', .95);
  if (to >= .6 && vo < .5) add('😎', 'Smooth Operator', 'Clean and calm, never shouty', .55);
  if (vo >= .8 && to < .4) add('🎺', 'Loud and Proud', 'Big presence first, notes second', .5);
  if (vo < .35) add('🙈', 'Shy Star', 'Your voice barely rose above the room', .45);
  if (ti < .3) add('🐢', 'Fashionably Late', 'Always a beat behind', .4);
  if (r.pts < 30) add('🦁', 'Brave Soul', 'You took the stage, and that counts', .35);
  if (!out.length) add('🌟', 'Showtime', 'You gave it a go', .3);
  return out.sort((a, b) => b.s - a.s).slice(0, 3);
}
function renderAwards() {
  const box = $('#awards'); box.textContent = ''; const ctx = { reacts: fxStats.reacts, stars: { avg: aud.avg, n: aud.n } };
  awData.list.forEach(r => {
    if (!r.hasMic) return; if (awData.list.length > 1) box.appendChild(el('div', avTxt(r.name) + r.name, 'awh'));
    awardsFor(r, ctx).forEach((a, i) => { const d = el('div', null, 'aw'), t = el('div'); d.style.setProperty('--i', i); t.append(el('b', a.title), el('small', a.why)); d.append(el('span', a.icon, 'ic'), t); box.appendChild(d); });
  });
}
function comboRow(bk, c) {
  if (!c || !c.bonus) return; const row = el('div', null, 'bk'), bar = el('div'), fill = el('i'); bar.appendChild(fill);
  row.append(el('span', '🔥 Combo'), bar, el('span', '+' + c.bonus)); bk.appendChild(row); setTimeout(() => fill.style.width = c.bonus * 10 + '%', 60);
}
// ---- podium (tournament) and end of night
function ovl(id) { let o = document.getElementById(id); if (!o) { o = el('div', null, 'ovl'); o.id = id; o.appendChild(el('div', null, 'box')); document.body.appendChild(o); } return o; }
function podiumEl(entries, tie) {   // entries sorted best first; shown 2nd, 1st, 3rd
  const pod = el('div', null, 'pod'), cols = ['#ffd75e,#c9940f', '#e4e8f0,#8d96a8', '#e0a070,#9a5b2e'], hs = [150, 112, 84], order = entries.length > 1 ? [1, 0, 2] : [0];
  order.forEach(i => { const e = entries[i]; if (!e) return; const a = avFor(e.name), col = el('div', null, 'pcol' + (i === 0 ? ' first' : '')), av = el('div', a.e, 'pav'); av.style.background = a.c;
    const rank = e.rank !== undefined ? e.rank : tie ? 0 : i, st = el('div', ['🥇', '🥈', '🥉'][rank], 'pstep'); st.style.height = hs[rank] + 'px'; st.style.background = 'linear-gradient(' + cols[rank] + ')'; st.style.animationDelay = (rank === 0 ? .5 : .2) + 's';
    col.append(el('div', rank === 0 ? '👑' : '', 'crown'), av, el('b', e.name), el('small', e.val + ' pts'), st); pod.appendChild(col); });
  return pod;
}
function showPodium(m) {
  const res = (m.results || []).map(x => ({ name: x.name, val: x.pts + ((x.combo && x.combo.bonus) || 0) + (x.name === m.winner ? 10 : 0) })).sort((a, b) => b.val - a.val);
  if (res.length < 2) return; const tie = !m.winner, o = ovl('podium'), box = o.firstChild; box.textContent = '';
  res.forEach(e => { e.rank = Math.min(2, res.filter(x => x.val > e.val).length); });      // shared scores share a step
  box.append(el('h2', '🏆 Tournament result'), el('p', tie ? 'It’s a tie at the top!' : avTxt(m.winner) + m.winner + ' wins the tournament (+10 bonus)!', 'note'), podiumEl(res, tie));
  if (res.length > 3) { const rest = el('div', null, 'note'); rest.textContent = res.slice(3).map((e, i) => (i + 4) + '. ' + e.name + ' ' + e.val + ' pts').join(' · '); box.append(rest); }
  const b = el('button', 'Continue'); b.onclick = () => o.classList.remove('show'); box.appendChild(b);
  setTimeout(() => { o.classList.add('show'); confetti(tie ? 85 : 100); }, 1500);
}
function nightStats() {
  const names = Object.keys(scores).sort((a, b) => scores[b] - scores[a]), plays = {};
  hist.forEach(h => h.who.forEach(n => plays[n] = (plays[n] || 0) + 1));
  const most = Object.keys(plays).sort((a, b) => plays[b] - plays[a] || (scores[b] || 0) - (scores[a] || 0))[0];
  let best = null, fav = null;
  hist.forEach(h => { h.res.forEach(r => { const v = r.pts + (r.bonus || 0); if (!best || v > best.v) best = { v, name: r.name, title: h.t }; }); if (h.stars && (!fav || h.stars > fav.s)) fav = { s: h.stars, name: h.who.join(' & '), title: h.t }; });
  return { names, plays, most, best, fav, songs: hist.length };
}
function openNight() {
  const st = nightStats(), o = ovl('night'), box = o.firstChild; box.textContent = ''; box.append(el('h2', '🏁 That’s a wrap!'));
  if (!st.songs && !st.names.length) box.append(el('p', 'Nobody has scored yet. Sing a few songs, then come back for the awards!', 'note'));
  else {
    box.append(el('p', 'Tonight’s champion: ' + avTxt(st.names[0]) + st.names[0] + ' with ' + scores[st.names[0]] + ' points!', 'note'), podiumEl(st.names.slice(0, 3).map(n => ({ name: n, val: scores[n] })), false));
    const stats = el('div', null, 'nstats'), card = (t, s) => { const d = el('div', null, 'nstat'); d.append(el('b', t), el('small', s)); stats.appendChild(d); };
    if (st.most) card('🎤 Most songs sung: ' + avTxt(st.most) + st.most, st.plays[st.most] + (st.plays[st.most] === 1 ? ' song' : ' songs') + ' tonight');
    if (st.best) card('⭐ Best single performance: ' + avTxt(st.best.name) + st.best.name, st.best.v + ' points for “' + st.best.title + '”');
    if (st.fav) card('💖 Crowd favourite: ' + st.fav.name, '“' + st.fav.title + '” · audience ★ ' + st.fav.s);
    card('🎶 Songs tonight', String(st.songs)); box.appendChild(stats);
  }
  const row = el('div', null, 'row'); row.style.justifyContent = 'center';
  const keep = el('button', 'Keep singing'); keep.onclick = () => o.classList.remove('show');
  const neu = el('button', 'Start a new night', 'ghost'); neu.onclick = () => { if (!confirm('Clear all scores and start a fresh night?')) return; o.classList.remove('show'); newNight(); };
  row.append(keep, neu); box.appendChild(row); o.classList.add('show'); confetti(100);
}
function newNight() {
  if (room.on) { roomOp({ op: 'newnight' }); return; }
  Object.keys(scores).forEach(k => delete scores[k]); hist.length = 0; Object.keys(localSung).forEach(k => delete localSung[k]); localTurn = 0; renderScores();
}
function histLocal(song, who, res) { hist.push({ t: song.title, a: song.artist, who, res, mode: 'solo', stars: 0 }); }
$('#endNight').onclick = () => { if (room.on) roomOp({ op: 'endnight' }); else openNight(); };
