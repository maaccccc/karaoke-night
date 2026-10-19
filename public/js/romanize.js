// ---- romanization: Korean (Revised Romanization) and Japanese kana (Hepburn)
const HI = 'g kk n d tt r m b pp s ss  j jj ch k t p h'.split(' ');
const HV = 'a ae ya yae eo e yeo ye o wa wae oe yo u wo we wi yu eu ui i'.split(' ');
const MOVE = [null,[0,0],[0,1],[1,9],[0,2],[4,12],[4,-1],[0,3],[0,5],[8,0],[8,6],[8,7],[8,9],[8,16],[8,17],[8,-1],[0,6],[0,7],[17,9],[0,9],[0,10],null,[0,12],[0,14],[0,15],[0,16],[0,17],[0,-1]];
const REP = ['','k','k','k','n','n','n','t','l','k','m','l','l','l','p','l','m','p','p','t','t','ng','t','t','k','t','p','t'];
function hangulRun(run) {
  const sy = [...run].map(ch => { const c = ch.charCodeAt(0) - 0xAC00, f = c % 28; return { f, v: ((c - f) / 28) % 21, i: Math.floor(c / 588) }; });
  sy.forEach((a, k) => {
    const b = sy[k + 1]; if (!b || !a.f) return;
    if (b.i === 11 && a.f !== 21) {                      // final sound moves onto the next vowel
      const [stay, mv] = MOVE[a.f]; a.f = stay;
      if (mv >= 0) b.i = (b.v === 20 && mv === 16) ? 14 : (b.v === 20 && mv === 3) ? 12 : mv;
      return;
    }
    let rep = REP[a.f];
    if ((a.f === 6 || a.f === 15 || a.f === 27) && [0, 3, 12].includes(b.i)) {   // h + g/d/j makes k/t/ch
      b.i = { 0: 15, 3: 16, 12: 14 }[b.i]; a.f = a.f === 27 ? 0 : a.f === 6 ? 4 : 8; rep = REP[a.f];
    }
    if (rep === 'k' || rep === 't' || rep === 'p') {
      const nas = { k: 'ng', t: 'n', p: 'm' }[rep];
      if (b.i === 2 || b.i === 6) rep = nas; else if (b.i === 5) { rep = nas; b.i = 2; }
    } else if ((rep === 'm' || rep === 'ng') && b.i === 5) b.i = 2;
    else if (rep === 'n' && b.i === 5) { rep = 'l'; b.l = true; }
    else if (rep === 'l' && (b.i === 2 || b.i === 5)) { b.i = 5; b.l = true; }
    a.rep = rep;
  });
  return sy.map(a => (a.l ? 'l' : HI[a.i]) + HV[a.v] + (a.rep !== undefined ? a.rep : REP[a.f])).join('');
}
const KANA = 'あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa をo ゐi ゑe んn\u0001 がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo ゔvu';
const KM = {}; KANA.split(' ').forEach(t => KM[t[0]] = t.slice(1));
const SY = { 'ゃ': 'a', 'ゅ': 'u', 'ょ': 'o' }, SV = { 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o' };
function kanaToRomaji(src) {
  const s = src.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  let out = '', sok = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === 'っ') { sok = true; continue; }
    if (c === 'ー') { const m = out.match(/[aiueo]$/); if (m) out += m[0]; continue; }
    let r = KM[c]; if (r === undefined) { out += c; sok = false; continue; }
    const n = s[i + 1];
    if (SY[n] && /i$/.test(r) && r !== 'i') { const st = r.slice(0, -1); r = (/^(sh|ch|j)$/.test(st) ? st : st + 'y') + SY[n]; i++; }
    else if (SV[n] && /^[a-z]+$/.test(r) && (r.length > 1 || r === 'u')) { const st = r === 'u' ? 'w' : /^(shi|chi|ji)$/.test(r) ? r.slice(0, -1) : r.slice(0, -1); r = st + SV[n]; i++; }
    if (sok) { out += r[0] === 'c' ? 't' : r[0]; sok = false; }
    out += r;
  }
  return out.replace(/\u0001(?=[aiueoy])/g, "'").replace(/\u0001/g, '');
}
function romanize(text) {
  let t = text;
  if (/[\uAC00-\uD7A3]/.test(t)) t = t.replace(/[\uAC00-\uD7A3]+/g, hangulRun);
  if (/[\u3040-\u30FF]/.test(t)) t = kanaToRomaji(t);
  return t === text ? null : t.charAt(0).toUpperCase() + t.slice(1);
}
/*ROM_END*/

