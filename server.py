"""Karaoke Night server: YouTube Music search (ytmusicapi) + timed lyrics (LRCLIB).
Run: pip install -r requirements.txt && python server.py
"""
import importlib.util, json, os, queue as _queue, random, re, shutil, tempfile, threading, time, unicodedata, urllib.request, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from ytmusicapi import YTMusic

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, 'public')
OAUTH_FILE = os.path.join(HERE, 'oauth.json')
UA = 'KaraokeNight/1.0 (private party app)'
MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css'}

yt = YTMusic()   # searching needs no login
_auth = None

def authed():
    """Logged-in client, only needed for saving playlists. Created on first use."""
    global _auth
    if _auth is None and os.path.exists(OAUTH_FILE):
        cid, secret = os.getenv('YTM_CLIENT_ID'), os.getenv('YTM_CLIENT_SECRET')
        if cid and secret:   # newer ytmusicapi versions need your own Google OAuth client
            from ytmusicapi.auth.oauth import OAuthCredentials
            _auth = YTMusic(OAUTH_FILE, oauth_credentials=OAuthCredentials(client_id=cid, client_secret=secret))
        else:
            _auth = YTMusic(OAUTH_FILE)
    return _auth

def search_songs(q):
    out = []
    for r in yt.search(q, filter='songs', limit=15):
        if not r.get('videoId'):
            continue
        out.append({'videoId': r['videoId'], 'title': r['title'],
                    'artist': ', '.join(a['name'] for a in r.get('artists') or []),
                    'duration': r.get('duration_seconds') or 0})
    return out

def get_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)

def norm(s):
    return re.sub(r'[\W_]+', '', (s or '').lower())

def title_keys(t):
    return {norm(t), norm(re.sub(r'[\(\[].*?[\)\]]', '', t or ''))} - {''}

def make_key(title, artist, duration):
    tk, a = title_keys(title), norm((artist or '').split(',')[0])
    def key(x):
        xt = title_keys(x.get('trackName'))
        tm = any(p in q or q in p for p in tk for q in xt)
        xa = norm(x.get('artistName'))
        am = bool(a) and bool(xa) and (a in xa or xa in a)
        return (not tm, not am, abs((x.get('duration') or 0) - duration))
    return key

def candidates(title, artist, duration):
    """LRCLIB results that have timed lyrics, best match first (title, then artist, then length)."""
    first = (artist or '').split(',')[0].strip()
    seen, out = set(), []
    for params in ({'track_name': title, 'artist_name': first}, {'q': (title + ' ' + first).strip()}):
        try:
            for x in get_json('https://lrclib.net/api/search?' + urllib.parse.urlencode(params)):
                if x.get('syncedLyrics') and x.get('id') not in seen:
                    seen.add(x['id']); out.append(x)
        except Exception:
            pass
    key = make_key(title, artist, duration)
    return sorted(out, key=key), key

def synced_lyrics(title, artist, duration):
    """Best timed lyrics (LRC text, lyric duration, id) from LRCLIB. Swap this to use a licensed provider."""
    first = (artist or '').split(',')[0].strip()
    try:
        d = get_json('https://lrclib.net/api/get?' + urllib.parse.urlencode(
            {'track_name': title, 'artist_name': first, 'duration': int(duration)}))
        if d.get('syncedLyrics'):
            return d['syncedLyrics'], d.get('duration') or 0, d.get('id')
    except Exception:
        pass
    ranked, key = candidates(title, artist, duration)
    if ranked and not key(ranked[0])[0]:      # only accept a result whose title really matches
        b = ranked[0]
        return b['syncedLyrics'], b.get('duration') or 0, b.get('id')
    return '', 0, None

HAS = {}
def has_lyrics(title, artist, duration):
    """True if timed lyrics exist for this song (cached, so searches stay quick after the first look)."""
    k = (title, artist, int(duration or 0))
    hit = HAS.get(k)
    if hit is None or (not hit[0] and time.time() - hit[1] > 600):   # "no" answers expire after 10 minutes (could have been a network hiccup)
        hit = HAS[k] = (bool(synced_lyrics(title, artist, duration)[0]), time.time())
    return hit[0]

def lyric_versions(title, artist, duration):
    ranked, _ = candidates(title, artist, duration)
    return [{'id': x['id'], 'title': x.get('trackName') or '', 'artist': x.get('artistName') or '',
             'duration': x.get('duration') or 0, 'diff': (x.get('duration') or 0) - duration} for x in ranked[:8]]

def save_playlist(name, ids):
    a = authed()
    if not a:
        raise RuntimeError('Not signed in to YouTube Music. See the README (run "ytmusicapi oauth" first).')
    pid = a.create_playlist(name, 'Made with Karaoke Night')
    if not isinstance(pid, str):
        raise RuntimeError('YouTube Music refused to create the playlist.')
    a.add_playlist_items(pid, ids)
    return 'https://music.youtube.com/playlist?list=' + pid

INCLUDE = re.compile(r'<!--#include file="([A-Za-z0-9_./-]+)" -->')

def render_page(path):
    """index.html is a small shell. Each <!--#include file="partials/x.html" --> line is replaced by that file,
    so the page can live in several HTML files while the browser still receives one document."""
    base = os.path.dirname(path)
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    def one(mo):
        p = os.path.normpath(os.path.join(base, mo.group(1)))
        if not p.startswith(base + os.sep) or not os.path.isfile(p):
            return '<!-- missing include: ' + mo.group(1) + ' -->'
        with open(p, 'r', encoding='utf-8') as g:
            return g.read()
    return INCLUDE.sub(one, html).encode('utf-8')

def find_page():
    """index.html normally lives in the public folder, but also accept it next to server.py."""
    for d in (PUB, HERE):
        f = os.path.join(d, 'index.html')
        if os.path.isfile(f):
            return f
    return None

# ---- Auto-align: listen to a song and time each lyric line (optional, needs stable-ts + ffmpeg)
JOBS, _model, _lock = {}, {}, threading.Lock()

def guess_lang(text):
    for pat, lang in ((r'[\uAC00-\uD7A3]', 'ko'), (r'[\u3040-\u30FF]', 'ja'), (r'[\u4E00-\u9FFF]', 'zh'), (r'[\u0400-\u04FF]', 'ru')):
        if re.search(pat, text):
            return lang
    return 'en'

def run_align(job, lines):
    j = JOBS[job]
    try:
        with _lock:                       # one song at a time
            import stable_whisper
            if 'm' not in _model:
                j.update(state='running', message='Loading the speech model (the first run downloads it)…')
                _model['m'] = stable_whisper.load_model(os.getenv('WHISPER_MODEL', 'base'))
            j.update(state='running', message='Listening to the song…')
            text = '\n'.join(lines)
            res = _model['m'].align(j['path'], text, language=guess_lang(text), original_split=True)
        segs = list(res.segments)
        if len(segs) == len(lines):
            times = [float(s.start) for s in segs]
        else:                             # fall back to word times, split by character count
            words = [w for s in segs for w in s.words]
            if not words:
                raise RuntimeError('No singing was found in the audio.')
            lc = [len(re.sub(r'\s+', '', l)) for l in lines]; ltot = sum(lc) or 1
            wc = [len(re.sub(r'\s+', '', w.word)) for w in words]; wtot = sum(wc) or 1
            times, before, acc, wi = [], 0, 0, 0
            for c in lc:
                target = before / ltot * wtot
                while wi < len(words) - 1 and acc + wc[wi] <= target:
                    acc += wc[wi]; wi += 1
                times.append(float(words[wi].start)); before += c
        for i in range(1, len(times)):
            times[i] = max(times[i], times[i - 1])
        j.update(state='done', times=[round(x, 2) for x in times], message='Done')
    except Exception as e:
        j.update(state='error', message=str(e))
    finally:
        shutil.rmtree(os.path.dirname(j['path']), ignore_errors=True)

def start_align(data):
    if importlib.util.find_spec('stable_whisper') is None:
        return 501, {'error': 'Auto-align needs the stable-ts package and ffmpeg. See the README, section "Auto-align".'}
    job = re.sub(r'[^A-Za-z0-9]', '', str(data.get('job', '')))[:40]
    lines = [str(l).strip() for l in data.get('lines', []) if str(l).strip()][:400]
    if job not in JOBS or not lines:
        return 400, {'error': 'Upload the audio first and provide the lyrics.'}
    JOBS[job].update(state='running', message='Starting…')
    threading.Thread(target=run_align, args=(job, lines), daemon=True).start()
    return 200, {'ok': True}

# ---- Online rooms: shared queue/scoreboard + relay for live voice (WebRTC signalling).
# Uses long-polling (plain HTTP), so it works through any tunnel or host. State lives in memory.
ROOMS, RLOCK = {}, threading.RLock()
GRACE = 8    # seconds a person who closed/refreshed the page may come back without losing their place
STALE = 45   # seconds without polling before someone counts as gone

def clean_code(s): return re.sub(r'[^A-Za-z0-9]', '', str(s or '')).upper()[:12]
def clean_id(s): return re.sub(r'[^A-Za-z0-9]', '', str(s or ''))[:24]
def clean_name(s): return re.sub(r'\s+', ' ', str(s or '')).strip()[:20] or 'Singer'

PICK_SECS = 45   # how long the singer has to choose Solo / Duet / Tournament

def pick_live(r):
    """The mode-choosing step, or None (and cleared) if it has timed out."""
    pk = r.get('pick')
    if pk and time.time() > pk['until']:
        r['pick'] = pk = None
    return pk

def start_pick(r, by):
    """Next step of starting a song: the owner of the first queued song chooses the mode, THEN everyone readies up."""
    if not r['queue'] or not r['clients']:
        return
    item = r['queue'][0]
    if not any(c['name'] == item['singer'] for c in r['clients'].values()):
        r['queue'].pop(0)
        room_push(r, {'type': 'readycancel', 'name': '', 'reason': item['singer'] + ' is not in the room, so their song was skipped.'})
        schedule_next(r, 3); return
    r['pick'] = {'item': item, 'by': by, 'until': time.time() + PICK_SECS}
    room_push(r, {'type': 'pick', 'item': item, 'by': by, 'until': int(r['pick']['until'] * 1000)})

def room_state(r):
    rd = r['ready']; yes = rd['yes'] if rd else set()
    peers = [{'id': i, 'name': c['name'], 'mic': c.get('mic', 'untested'), 'ready': i in yes, 'av': c.get('av') or clean_av(None), 'vc': bool(c.get('vc')), 'vcm': bool(c.get('vcm')),
              'away': bool(c.get('leaving'))} for i, c in r['clients'].items()]
    return {'type': 'state', 'players': [p['name'] for p in peers], 'peers': peers,
            'queue': r['queue'], 'scores': r['scores'], 'busy': bool(r['now']), 'picking': pick_live(r)['item']['singer'] if pick_live(r) else '',
            'singer': r['now']['singer'] if r['now'] else '',
            'singers': r['now']['singers'] if r['now'] else []}

def room_push(r, msg, to=None):
    for i, c in r['clients'].items():
        if to is None or i == to:
            c['q'].put(msg)

def room_drop(r, cid):
    gone = r['clients'].pop(cid, None)
    nw = r['now']
    if gone and nw and gone['name'] in nw['singers'] and gone['name'] not in nw['got']:
        nw['got'][gone['name']] = {'pts': 0, 'parts': dict(ZP), 'hasMic': False}
        song_done(r, quiet=True)
    r['empty'] = time.time()
    pk = r.get('pick')
    if gone and pk and pk['item']['singer'] == gone['name']:
        r['pick'] = None
        room_push(r, {'type': 'pickcancel', 'reason': gone['name'] + ' left, so the start was cancelled.'})
    if not r['clients']:
        r['ready'] = None; r['pick'] = None
    else:
        room_launch(r)      # the last person we were waiting for may have just left
        maybe_go(r)         # ...or the last device we were waiting to load

def ready_msg(r):
    rd = r['ready']
    names = [r['clients'][i]['name'] for i in rd['yes'] if i in r['clients']]
    return {'type': 'ready', 'item': rd['item'], 'by': rd['by'], 'until': int(rd['until'] * 1000), 'yes': names}

def room_launch(r):
    """Start the song once every connected person has pressed Ready."""
    rd = r['ready']
    if not rd or not r['clients'] or not set(r['clients']) <= rd['yes']:
        return
    r['ready'] = None
    item = next((q for q in r['queue'] if q['id'] == rd['item']['id']), None)
    if not item:
        room_push(r, {'type': 'readycancel', 'name': '', 'reason': 'The queue changed, so the start was cancelled.'}); return
    r['queue'].remove(item)
    begin_song(r, item)

EMOJIS = ['🎤', '😎', '🦄', '🐱', '🐶', '🦊', '🐼', '🐸', '🤖', '👽', '🎸', '🍕', '🌟', '🔥', '👑', '🦖']
COLORS = ['#ff3d8b', '#35e0ff', '#ffc83d', '#3be58a', '#b388ff', '#ff8a3d', '#ff5252', '#7cb7ff']
REACTS = ['👏', '🔥', '❤️', '😂', '🎉', '😮']
def clean_av(av):
    av = av if isinstance(av, dict) else {}
    return {'e': av.get('e') if av.get('e') in EMOJIS else EMOJIS[0], 'c': av.get('c') if av.get('c') in COLORS else COLORS[0]}

ZP = {'Singing': 0.0, 'Tone': 0.0, 'Volume': 0.0, 'Timing': 0.0}
THEMES_PICK = ('neon', 'arcade', 'stars')
THEMES_OK = THEMES_PICK + ('vote',)

def fair_sort(r):
    """Keep the queue in a fair order: people take turns, so one person queuing five songs cannot block everyone else.
    Whoever sang longest ago (or never) goes first; each person's own songs keep the order they were added in."""
    q = r['queue']
    if len(q) < 2:
        return
    pk, rd = r.get('pick'), r.get('ready')
    lid = pk['item']['id'] if pk else (rd['item']['id'] if rd else None)     # a song already being started stays first
    head = [x for x in q if x['id'] == lid]
    rest = [x for x in q if x['id'] != lid]
    last, out, turn = dict(r.get('sung', {})), [], r.get('turn', 0) + 1
    while rest:
        best, bl = 0, None
        for i, it in enumerate(rest):
            l = last.get(it['singer'], -1)
            if bl is None or l < bl:
                best, bl = i, l
        it = rest.pop(best); out.append(it)
        last[it['singer']] = turn; turn += 1
        if it.get('singer2'):
            last[it['singer2']] = turn
    r['queue'] = head + out

AUTO_DELAY = 8   # seconds between songs before the next one starts by itself

PREP_MAX = 15      # seconds to wait for slow devices to finish loading before starting anyway
GO_DELAY = 4000    # milliseconds of on-screen countdown once everybody is loaded

def maybe_go(r, force=False):
    """Everyone has loaded the lyrics and the video (or we ran out of patience): start the countdown for all at once."""
    nw = r['now']
    if not nw or nw.get('went'):
        return
    here = {i for i, c in r['clients'].items() if not c.get('leaving')}   # nobody waits for a closed tab
    if force or (nw['need'] & here) <= nw['loaded']:
        nw['went'] = True
        if nw.get('prep_t'):
            nw['prep_t'].cancel()
        room_push(r, {'type': 'go', 'at': int(time.time() * 1000) + GO_DELAY})

def force_go(code, token):
    with RLOCK:
        r = ROOMS.get(code)
        if r and r['now'] is not None and id(r['now']) == token:
            maybe_go(r, force=True)

def begin_song(r, item):
    """Start a queue item for everyone. Only the named singer(s) are allowed to sing and score it."""
    names, sids = [], []
    for n in [item['singer']] + ([item['singer2']] if item.get('singer2') else []):
        for i, c in r['clients'].items():
            if c['name'] == n and n not in names:
                names.append(n); sids.append(i)
    if not names:
        room_push(r, {'type': 'readycancel', 'name': '', 'reason': item['singer'] + ' is not in the room, so the song was skipped.'})
        schedule_next(r, 3); return
    mode = item.get('mode') if len(names) == 2 else 'solo'
    r['now'] = {'singers': names, 'singer': names[0], 'sids': sids, 'mode': mode, 'got': {},
                'ends': time.time() + max(60, item['song']['duration']) + 45}
    r['last'] = None
    r['turn'] = r.get('turn', 0) + 1
    for n in names:
        r['sung'][n] = r['turn']
    fair_sort(r)
    theme = item.get('theme') or 'neon'
    if theme == 'vote':                              # the room voted during the ready check
        votes = [v for i, v in r.get('tv', {}).items() if i in r['clients']]
        cnt = {k: votes.count(k) for k in THEMES_PICK}; top = max(cnt.values())
        theme = random.choice([k for k, v in cnt.items() if v == top])
    r['tv'] = {}
    nw = r['now']; nw.update(need=set(r['clients']), loaded=set(), went=False, song=item['song'])
    t = threading.Timer(PREP_MAX, force_go, args=(r['code'], id(nw))); t.daemon = True; nw['prep_t'] = t; t.start()
    item = dict(item, mode=mode, singer2=names[1] if len(names) == 2 else '', theme=theme)
    # 'prep': every browser loads lyrics + video first and reports 'loaded'; the countdown ('go') starts when all have
    room_push(r, {'type': 'start', 'item': item, 'sids': sids, 'seed': random.getrandbits(31), 'at': 0, 'prep': True})

def song_done(r, quiet=False):
    """Called when a singer reports (or leaves). Once every singer is in, publish results and line up the next song."""
    nw = r['now']
    if not nw or any(n not in nw['got'] for n in nw['singers']):
        return
    res = [dict(nw['got'][n], name=n) for n in nw['singers']]
    for x in res:
        cbo = x.get('combo') if isinstance(x.get('combo'), dict) else {}
        x['bonus'] = cbo.get('bonus', 0)
    tot = lambda x: x['pts'] + x['bonus']
    winner = ''
    if nw['mode'] == 'tournament' and len(res) == 2 and tot(res[0]) != tot(res[1]):
        winner = max(res, key=tot)['name']
    for x in res:
        r['scores'][x['name']] = r['scores'].get(x['name'], 0) + tot(x) + (10 if x['name'] == winner else 0)
    r['now'] = None
    r['last'] = {'singers': list(nw['singers']), 'votes': {}, 'bonus': 0}   # audience stars open until the next song starts
    if not (quiet and not any(x['hasMic'] for x in res)):
        msg = {'type': 'result', 'name': res[0]['name'], 'pts': res[0]['pts'], 'parts': res[0]['parts'],
               'hasMic': res[0]['hasMic'], 'mode': nw['mode'], 'winner': winner, 'combo': res[0].get('combo')}
        if len(res) > 1:
            msg['results'] = res
        room_push(r, msg)
        song = nw.get('song') or {}
        r['hist'] = (r.get('hist') or [])[-99:] + [{'t': str(song.get('title', ''))[:120], 'a': str(song.get('artist', ''))[:120], 'who': list(nw['singers']),
                    'res': [{'name': x['name'], 'pts': x['pts'], 'bonus': x['bonus'] + (10 if x['name'] == winner else 0)} for x in res], 'mode': nw['mode'], 'stars': 0}]
        room_push(r, {'type': 'hist', 'hist': r['hist']})
    schedule_next(r, AUTO_DELAY)

def schedule_next(r, delay):
    if r.get('timer'):
        r['timer'].cancel()
    if not r['queue'] or not r['clients']:
        return
    nxt = r['queue'][0]
    room_push(r, {'type': 'next', 'item': nxt, 'in': delay})
    t = threading.Timer(delay, auto_next, args=(r['code'], nxt['id'])); t.daemon = True
    r['timer'] = t; t.start()

def auto_next(code, item_id):
    with RLOCK:
        r = ROOMS.get(code)
        if not r or r['now'] or r['ready'] or pick_live(r) or not r['clients'] or not r['queue'] or r['queue'][0]['id'] != item_id:
            return
        start_pick(r, 'Auto-play')
        room_push(r, room_state(r))

def room_prune():
    now = time.time()
    for code in list(ROOMS):
        r = ROOMS[code]
        dead = [i for i, c in r['clients'].items() if now - c['seen'] > STALE or (c.get('leaving') and now - c['leaving'] > GRACE)]
        for i in dead:
            room_drop(r, i)
        if dead and r['clients']:
            room_push(r, room_state(r))
        if not r['clients'] and now - r['empty'] > 600:
            del ROOMS[code]

def room_join(code, cid, name, av=None):
    with RLOCK:
        room_prune()
        r = ROOMS.setdefault(code, {'code': code, 'timer': None, 'clients': {}, 'queue': [], 'chat': [], 'hist': [], 'sung': {}, 'turn': 0, 'tv': {}, 'scores': {}, 'now': None, 'ready': None, 'pick': None, 'nid': 0, 'empty': time.time()})
        inherit = None
        # same person coming back (refresh / new tab id): take over their old seat by name
        for i, c in list(r['clients'].items()):
            if i != cid and c['name'] == name and (c.get('leaving') or time.time() - c['seen'] > 25):
                inherit = r['clients'].pop(i).get('mic')
                if r['ready'] and i in r['ready']['yes']: r['ready']['yes'].discard(i); r['ready']['yes'].add(cid)
        taken = {c['name'] for i, c in r['clients'].items() if i != cid}
        base, n = name, 2
        if cid in r['clients'] and r['clients'][cid]['name'] == name: taken.discard(name)
        while name in taken:
            name = '%s %d' % (base[:17], n); n += 1
        old = r['clients'].get(cid)
        r['clients'][cid] = {'name': name, 'q': _queue.Queue(), 'seen': time.time(), 'mic': (old or {}).get('mic') or inherit or 'untested',
                                'av': clean_av(av) if av else (old or {}).get('av') or clean_av(None)}
        r['scores'].setdefault(name, 0)
        room_push(r, room_state(r))
        if r['ready'] and time.time() < r['ready']['until']:
            r['clients'][cid]['q'].put(ready_msg(r))
        pk = pick_live(r)
        if pk:   # someone refreshed or joined while a mode is being chosen: show them the same step
            r['clients'][cid]['q'].put({'type': 'pick', 'item': pk['item'], 'by': pk['by'], 'until': int(pk['until'] * 1000)})
        if r.get('chat'):
            r['clients'][cid]['q'].put({'type': 'chatlog', 'msgs': r['chat'][-40:]})
        if r.get('hist'):
            r['clients'][cid]['q'].put({'type': 'hist', 'hist': r['hist']})
        if r.get('lg'):
            r['clients'][cid]['q'].put(lg_msg(r))
        return {'id': cid, 'name': name, 'now': int(time.time() * 1000)}

def room_leave(code, cid):
    with RLOCK:
        r = ROOMS.get(code)
        if r and cid in r['clients']:
            r['clients'][cid]['leaving'] = time.time(); room_push(r, room_state(r))   # dropped after GRACE seconds
            maybe_go(r)

def room_poll(code, cid, wait=20):
    with RLOCK:
        room_prune()
        r = ROOMS.get(code); c = r and r['clients'].get(cid)
        if not c:
            return None
        c['seen'] = time.time(); c.pop('leaving', None); q = c['q']
    msgs = []
    try:
        msgs.append(q.get(timeout=wait))
        while True:
            msgs.append(q.get_nowait())
    except _queue.Empty:
        pass
    with RLOCK:
        if cid in (ROOMS.get(code) or {'clients': {}})['clients']:
            ROOMS[code]['clients'][cid]['seen'] = time.time()
    return msgs

def room_send(code, cid, typ, data, to=None):
    """Handle one action from a room member. Returns an optional message for that person."""
    with RLOCK:
        r = ROOMS.get(code); me = r and r['clients'].get(cid)
        if not me:
            raise RuntimeError('You are not in the room any more. Reload the page.')
        me['seen'] = time.time()
        if typ == 'rtc':                       # relay WebRTC signalling to one person
            if to in r['clients']:
                r['clients'][to]['q'].put({'type': 'rtc', 'from': cid, 'data': data})
            return None
        op, reply = data.get('op'), None
        if op == 'qadd':
            s = data.get('song') or {}; vid = s.get('videoId')
            if not isinstance(vid, str) or vid.startswith('local:') or len(r['queue']) >= 100:
                return 'That song cannot be added to a room queue.'
            singer, s2, mode = me['name'], '', 'solo'   # you always queue as yourself; mode + partner are chosen when the song starts
            try: dur = float(s.get('duration') or 0)
            except Exception: dur = 0
            r['nid'] += 1
            r['queue'].append({'id': r['nid'], 'singer': singer, 'singer2': s2, 'mode': mode, 'song': {
                'videoId': vid[:40], 'title': str(s.get('title', ''))[:200],
                'artist': str(s.get('artist', ''))[:200], 'duration': dur}})
            fair_sort(r)
        elif op == 'loaded':       # this browser has the lyrics and the video ready
            nw = r['now']
            if nw and not nw.get('went'):
                nw['loaded'].add(cid); maybe_go(r)
            return None
        elif op == 'mic':
            if data.get('mic') in ('untested', 'tested', 'blocked', 'none', 'error'): me['mic'] = data['mic']
        elif op == 'skip':         # anyone can unstick a song whose video is blocked or whose singer dropped out
            if r['now'] or r['ready'] or pick_live(r):
                was_playing = bool(r['now'])
                r['now'] = None; r['ready'] = None; r['pick'] = None
                room_push(r, {'type': 'skip', 'by': me['name'], 'reason': str(data.get('reason') or '')[:160]})
                if was_playing: schedule_next(r, 3)
        elif op == 'tvote':        # vote for the stage look during the ready check (only when the singer chose "Room votes")
            rd = r['ready']
            if rd and time.time() < rd['until'] and rd['item'].get('theme') == 'vote' and data.get('t') in THEMES_PICK:
                r.setdefault('tv', {})[cid] = data['t']
                cnt = {}
                for v in r['tv'].values():
                    cnt[v] = cnt.get(v, 0) + 1
                room_push(r, {'type': 'tvotes', 'counts': cnt})
            return None
        elif op == 'endnight':     # show the end-of-night screen to everyone
            room_push(r, {'type': 'night', 'by': me['name']})
            return None
        elif op == 'newnight':     # clear scores and history, and let everyone take turns afresh
            r['scores'] = {}; r['hist'] = []; r['sung'] = {}; r['turn'] = 0
            fair_sort(r)
            room_push(r, {'type': 'hist', 'hist': []})
        elif op == 'chat':         # room chat, kept for the last 60 messages so late joiners see the conversation
            text = re.sub(r'[\x00-\x1f\x7f]+', ' ', str(data.get('text') or '')).strip()[:200]
            now = time.time()
            if not text or now - me.get('ct', 0) < 0.5:
                return None
            me['ct'] = now
            m = {'type': 'chat', 'from': me['name'], 'av': me.get('av'), 'text': text, 'at': int(now * 1000)}
            r['chat'] = (r.get('chat') or [])[-59:] + [m]
            room_push(r, m)
            return None
        elif op == 'vc':           # joined / left / muted the voice chat (audio itself goes browser to browser)
            me['vc'] = bool(data.get('on')); me['vcm'] = bool(data.get('muted')) and me['vc']
        elif op == 'avatar':
            me['av'] = clean_av(data.get('av'))
        elif op == 'react':        # floating emoji from the audience (not stored, just relayed)
            now = time.time()
            if data.get('e') in REACTS and (r['now'] or r.get('last')) and now - me.get('rt', 0) > 0.12:
                me['rt'] = now
                room_push(r, {'type': 'react', 'e': data['e'], 'from': me['name']})
            return None
        elif op == 'star':         # 1 to 5 stars for the song that just finished; the average becomes bonus points (max 10)
            la = r.get('last')
            if not la or me['name'] in la['singers']:
                return None
            try: n = max(1, min(5, int(data.get('n'))))
            except Exception: return None
            la['votes'][cid] = n
            avg = sum(la['votes'].values()) / len(la['votes']); bonus = round(avg * 2)
            for nm in la['singers']:
                r['scores'][nm] = r['scores'].get(nm, 0) + bonus - la['bonus']
            la['bonus'] = bonus
            if r.get('hist'):
                r['hist'][-1]['stars'] = round(avg, 1)
                room_push(r, {'type': 'hist', 'hist': r['hist']})
            room_push(r, {'type': 'stars', 'avg': round(avg, 1), 'n': len(la['votes']), 'bonus': bonus})
        elif op == 'qrm':
            r['queue'] = [q for q in r['queue'] if q['id'] != data.get('id')]
            fair_sort(r)
            pk = pick_live(r)
            if pk and not any(q['id'] == pk['item']['id'] for q in r['queue']):
                r['pick'] = None
                why = str(data.get('reason') or '')[:160]    # e.g. the singer's browser found no timed lyrics
                room_push(r, {'type': 'pickcancel', 'reason': why or 'That song was removed from the queue.'})
                if why: schedule_next(r, 3)                   # keep the queue moving to the next song
        elif op == 'start':
            nw, rd = r['now'], r['ready']
            if nw and time.time() < nw['ends']:
                return 'A song is already being sung.'
            if rd and time.time() < rd['until']:
                return 'Waiting for everyone to get ready.'
            pk = pick_live(r)
            if pk:
                return pk['item']['singer'] + ' is choosing the mode.'
            if not r['queue']:
                return 'The queue is empty.'
            if r.get('timer'):
                r['timer'].cancel()
            start_pick(r, me['name'])
        elif op == 'mode':         # the singer of the next song picks Solo / Duet / Tournament (+ partner), then the ready check begins
            pk = pick_live(r)
            if not pk or not r['queue'] or r['queue'][0]['id'] != pk['item']['id'] or pk['item']['singer'] != me['name']:
                return 'It is not your turn to choose a mode.'
            item = r['queue'][0]
            s2 = clean_name(data.get('singer2')) if data.get('singer2') else ''
            mode = data.get('mode')
            names = {c['name'] for c in r['clients'].values()}
            if mode in ('duet', 'tournament'):
                if s2 not in names or s2 == item['singer']:
                    return 'Pick a partner who is in the lobby.'
            else:
                s2, mode = '', 'solo'
            item['mode'], item['singer2'] = mode, s2
            item['theme'] = data.get('theme') if data.get('theme') in THEMES_OK else 'neon'
            r['tv'] = {}
            r['pick'] = None
            r['ready'] = {'item': item, 'yes': {cid}, 'until': time.time() + 30, 'by': pk['by'] if pk['by'] != 'Auto-play' else me['name']}
            room_push(r, ready_msg(r))
            room_launch(r)
        elif op == 'unpick':
            pk = pick_live(r)
            if pk and pk['item']['singer'] == me['name']:
                r['pick'] = None
                room_push(r, {'type': 'pickcancel', 'reason': me['name'] + ' cancelled the start.'})
        elif op == 'ready':
            rd = r['ready']
            if rd and time.time() < rd['until']:
                rd['yes'].add(cid)
                room_push(r, {'type': 'readystate', 'yes': [r['clients'][i]['name'] for i in rd['yes'] if i in r['clients']]})
                room_launch(r)
        elif op == 'unready':
            if r['ready']:
                r['ready'] = None
                room_push(r, {'type': 'readycancel', 'name': me['name'], 'reason': me['name'] + ' is not ready yet.'})
        elif op == 'lg_guess':     # Guess the Lyrics: a guess for the missing word (checked here, so nobody can peek at the answer)
            lg = r.get('lg')
            if not lg or lg['phase'] != 'round' or me['name'] in lg['solved']:
                return None
            now = time.time()
            if now - me.get('lgt', 0) < 0.35:
                return None
            me['lgt'] = now
            if lg_match(data.get('text'), lg['rounds'][lg['i']]['answer']):
                pts = 5 + round(10 * max(0.0, lg['ends'] - now) / LG_SECS) + (3 if not lg['solved'] else 0)   # faster is worth more, first solver gets +3
                lg['solved'][me['name']] = pts
                lg['scores'][me['name']] = lg['scores'].get(me['name'], 0) + pts
                room_push(r, lg_msg(r))
                if all(c['name'] in lg['solved'] for c in r['clients'].values()):
                    lg_round_end(r['code'], lg, lg['i'])
            else:
                room_push(r, {'type': 'lgwrong'}, to=cid)
            return None
        elif op == 'lg_stop':
            lg = r.get('lg')
            if lg and lg['phase'] != 'final':
                lg_finish(r, lg, me['name'] + ' ended the game.')
            return None
        elif op == 'score':
            nw = r['now']
            if not nw or me['name'] not in nw['singers'] or me['name'] in nw['got']:
                return None
            try: pts = max(0, min(100, int(data.get('pts') or 0)))
            except Exception: pts = 0
            parts = data.get('parts') if isinstance(data.get('parts'), dict) else {}
            clean = {}
            for k in ('Singing', 'Tone', 'Volume', 'Timing'):
                try: clean[k] = float(parts.get(k, 0))
                except Exception: clean[k] = 0.0
            cbi = data.get('combo') if isinstance(data.get('combo'), dict) else {}
            try: cmax = max(0, min(999, int(cbi.get('max') or 0)))
            except Exception: cmax = 0
            nw['got'][me['name']] = {'pts': pts, 'parts': clean, 'hasMic': bool(data.get('hasMic')),
                                     'combo': {'max': cmax, 'bonus': min(10, round(cmax * 0.8))}}   # the bonus is worked out here, not trusted from the browser
            song_done(r)
        room_push(r, room_state(r))
        return reply

# ---- Guess the Lyrics (room game for 2+ people): a lyric line with one word missing, type the word.
# The answers stay on the server; browsers only ever receive the line with the blank.
LG_SECS, LG_REVEAL, LG_INTRO, LG_ROUNDS = 25, 5, 4, 8
LG_STOP = set("the and you that with have this your for are but not was were from they them what when will would could there their about into just like dont cant wont been being than then these those over only also some more much very here where which while still every ever never always again away down back gonna wanna cause because".split())

def lg_norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).casefold()
    return re.sub(r'[\W_]+', '', ''.join(ch for ch in s if not unicodedata.combining(ch)))

def lg_match(guess, answer):
    """Exact match, or one typo for longer words."""
    g, a = lg_norm(guess), lg_norm(answer)
    if not g:
        return False
    if g == a:
        return True
    if len(a) >= 5 and abs(len(g) - len(a)) <= 1:
        if len(g) == len(a):
            return sum(x != y for x, y in zip(g, a)) <= 1
        short, long_ = (g, a) if len(g) < len(a) else (a, g)
        return any(long_[:i] + long_[i + 1:] == short for i in range(len(long_)))
    return False

def lg_core(w):
    return re.sub(r'^\W+|\W+$', '', w)

def lg_build(title, artist, duration):
    """Pick random lyric lines and hide one word in each. Raises RuntimeError with a friendly message if the song will not work."""
    lrc = synced_lyrics(title, artist, duration)[0]
    if not lrc:
        raise RuntimeError('No lyrics were found for that song. Try another one.')
    seen, pool = set(), []
    for raw in lrc.splitlines():
        text = re.sub(r'\s+', ' ', re.sub(r'^(\s*\[[^\]]*\])+', '', raw)).strip()
        words = text.split(' ')
        key = lg_norm(text)
        if not key or key in seen or not 4 <= len(words) <= 12 or not 16 <= len(text) <= 90:
            continue
        seen.add(key)
        cands = [i for i, w in enumerate(words)
                 if len(lg_core(w)) >= 4 and re.fullmatch(r"[^\W\d_]+", lg_core(w)) and lg_core(w).casefold() not in LG_STOP]
        if cands:
            pool.append((text, words, cands))
    if len(pool) < 5:
        raise RuntimeError('That song does not have enough plain English-style lyric lines for this game. Try another song.')
    rounds = []
    for text, words, cands in random.sample(pool, min(LG_ROUNDS, len(pool))):
        i = random.choice(cands)
        mo = re.match(r'^(\W*)(.*?)(\W*)$', words[i])
        lead, core, trail = mo.group(1), mo.group(2), mo.group(3)
        rounds.append({'line': text, 'answer': core, 'n': len(core),
                       'pre': ' '.join(words[:i]) + (' ' if i else '') + lead,
                       'post': trail + (' ' if i + 1 < len(words) else '') + ' '.join(words[i + 1:])})
    return rounds

def lg_msg(r):
    lg = r.get('lg')
    if not lg:
        return {'type': 'lg', 'phase': 'none'}
    m = {'type': 'lg', 'phase': lg['phase'], 'song': lg['song'], 'host': lg['host'], 'of': len(lg['rounds']), 'n': lg['i'] + 1,
         'scores': lg['scores'], 'solved': lg['solved'], 'hint': lg['hint'], 'note': lg.get('note', ''),
         'ends': int(lg['ends'] * 1000), 'secs': LG_SECS, 'players': [c['name'] for c in r['clients'].values()]}
    if lg['phase'] in ('round', 'reveal') and 0 <= lg['i'] < len(lg['rounds']):
        rd = lg['rounds'][lg['i']]
        m.update(pre=rd['pre'], post=rd['post'], len=rd['n'])
        if lg['phase'] == 'reveal':
            m.update(line=rd['line'], answer=rd['answer'])
    return m

def lg_timer(lg, key, secs, fn, *args):
    old = lg.get(key)
    if old:
        old.cancel()
    t = threading.Timer(secs, fn, args); t.daemon = True; lg[key] = t; t.start()

def lg_alive(code, lg):
    r = ROOMS.get(code)
    return r if r and r.get('lg') is lg else None

def lg_round_start(code, lg, i):
    with RLOCK:
        r = lg_alive(code, lg)
        if not r or lg['phase'] == 'final':
            return
        if len(r['clients']) < 2:
            lg_finish(r, lg, 'Everyone else left, so the game ended.'); return
        lg.update(i=i, phase='round', solved={}, hint='', ends=time.time() + LG_SECS)
        room_push(r, lg_msg(r))
        lg_timer(lg, 'timer', LG_SECS, lg_round_end, code, lg, i)
        lg_timer(lg, 'htimer', LG_SECS * 0.45, lg_hint, code, lg, i)

def lg_hint(code, lg, i):
    with RLOCK:
        r = lg_alive(code, lg)
        if not r or lg['i'] != i or lg['phase'] != 'round':
            return
        lg['hint'] = lg['rounds'][i]['answer'][0]          # first letter appears in the first box
        room_push(r, lg_msg(r))

def lg_round_end(code, lg, i):
    with RLOCK:
        r = lg_alive(code, lg)
        if not r or lg['i'] != i or lg['phase'] != 'round':
            return
        lg['phase'] = 'reveal'; lg['ends'] = time.time() + LG_REVEAL
        if lg.get('htimer'):
            lg['htimer'].cancel()
        room_push(r, lg_msg(r))
        if i + 1 < len(lg['rounds']):
            lg_timer(lg, 'timer', LG_REVEAL, lg_round_start, code, lg, i + 1)
        else:
            lg_timer(lg, 'timer', LG_REVEAL, lg_finish_later, code, lg)

def lg_finish_later(code, lg):
    with RLOCK:
        r = lg_alive(code, lg)
        if r and lg['phase'] != 'final':
            lg_finish(r, lg, '')

def lg_finish(r, lg, note):
    lg['phase'] = 'final'; lg['note'] = note
    for k in ('timer', 'htimer'):
        if lg.get(k):
            lg[k].cancel()
    room_push(r, lg_msg(r))

def lg_start_game(code, cid, song):
    """Called from /api/lg/start. The lyric lookup is a network call, so it happens outside the room lock."""
    def check():
        r = ROOMS.get(code); me = r and r['clients'].get(cid)
        if not me:
            raise RuntimeError('You are not in the room any more. Reload the page.')
        if len(r['clients']) < 2:
            raise RuntimeError('Guess the Lyrics needs at least 2 people in the room.')
        old = r.get('lg')
        if old and old['phase'] in ('intro', 'round', 'reveal'):
            raise RuntimeError('A game is already running. Wait for it to finish, or end it first.')
        return r, me
    with RLOCK:
        check()
    title, artist = str(song.get('title') or '')[:120], str(song.get('artist') or '')[:120]
    try: dur = float(song.get('duration') or 0)
    except Exception: dur = 0
    rounds = lg_build(title, artist, dur)
    with RLOCK:
        r, me = check()
        lg = {'host': me['name'], 'song': {'title': title, 'artist': artist}, 'rounds': rounds, 'i': -1, 'phase': 'intro',
              'scores': {c['name']: 0 for c in r['clients'].values()}, 'solved': {}, 'hint': '', 'note': '',
              'ends': time.time() + LG_INTRO, 'timer': None, 'htimer': None}
        r['lg'] = lg
        room_push(r, lg_msg(r))
        lg_timer(lg, 'timer', LG_INTRO, lg_round_start, code, lg, 0)
    return {'ok': True, 'rounds': len(rounds)}

class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        try:
            if u.path == '/api/search':
                term = (q.get('q', [''])[0]).strip()
                return self.send_json(200, search_songs(term) if len(term) >= 2 else [])
            if u.path == '/api/ice':          # STUN, plus an optional TURN relay for strict networks (set TURN_URL / TURN_USER / TURN_PASS)
                ice = [{'urls': 'stun:stun.l.google.com:19302'}, {'urls': 'stun:stun1.l.google.com:19302'}]
                turn = [x.strip() for x in os.getenv('TURN_URL', '').split(',') if x.strip()]
                if turn:
                    ice.append({'urls': turn, 'username': os.getenv('TURN_USER', ''), 'credential': os.getenv('TURN_PASS', '')})
                return self.send_json(200, {'iceServers': ice, 'turn': bool(turn)})
            if u.path == '/api/room/time':
                return self.send_json(200, {'now': int(time.time() * 1000)})
            if u.path == '/api/room/poll':
                msgs = room_poll(clean_code(q.get('room', [''])[0]), clean_id(q.get('id', [''])[0]))
                return self.send_json(410, {'error': 'gone'}) if msgs is None else self.send_json(200, {'msgs': msgs})
            if u.path == '/api/align/status':
                j = JOBS.get(q.get('job', [''])[0])
                return self.send_json(200, {k: v for k, v in j.items() if k != 'path'} if j else {'state': 'unknown', 'message': 'Unknown job'})
            if u.path == '/api/haslyrics':
                g = lambda k: q.get(k, [''])[0]
                return self.send_json(200, {'has': has_lyrics(g('title'), g('artist'), float(g('duration') or 0))})
            if u.path == '/api/versions':
                g = lambda k: q.get(k, [''])[0]
                return self.send_json(200, lyric_versions(g('title'), g('artist'), float(g('duration') or 0)))
            if u.path == '/api/lyrics':
                g = lambda k: q.get(k, [''])[0]
                if g('id').isdigit():
                    d = get_json('https://lrclib.net/api/get/' + g('id'))
                    return self.send_json(200, {'lrc': d.get('syncedLyrics') or '', 'lyricDuration': d.get('duration') or 0, 'id': d.get('id')})
                lrc, ld, lid = synced_lyrics(g('title'), g('artist'), float(g('duration') or 0))
                return self.send_json(200, {'lrc': lrc, 'lyricDuration': ld, 'id': lid})
        except Exception as e:
            return self.send_json(502, {'error': str(e)})
        if u.path in ('/', '/index.html'):
            path = find_page()
            if not path:
                body = ('<h2>Karaoke Night: index.html not found</h2><p>Put <b>index.html</b> in this folder:</p><pre>' + PUB +
                        '</pre><p>(The server is running from <code>' + HERE + '</code>.)</p>').encode()
                self.send_response(404); self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        else:
            path = os.path.normpath(os.path.join(PUB, u.path.lstrip('/')))
            if not path.startswith(PUB + os.sep) or not os.path.isfile(path):
                self.send_response(404); self.end_headers(); return
        if u.path in ('/', '/index.html'):
            body = render_page(path)
        else:
            with open(path, 'rb') as f:
                body = f.read()
        self.send_response(200); self.send_header('Content-Type', MIME.get(os.path.splitext(path)[1], 'application/octet-stream'))
        self.send_header('Cache-Control', 'no-cache')   # always pick up edited files
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_POST(self):
        try:
            u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
            n = int(self.headers.get('Content-Length', 0))
            if u.path == '/api/align/upload':        # raw audio bytes
                job = re.sub(r'[^A-Za-z0-9]', '', q.get('job', [''])[0])[:40]
                ext = re.sub(r'[^A-Za-z0-9]', '', q.get('ext', ['mp3'])[0])[:5] or 'mp3'
                if not job or n <= 0 or n > 300_000_000:
                    raise RuntimeError('Bad upload (files up to 300 MB).')
                fp = os.path.join(tempfile.mkdtemp(prefix='karaoke_'), 'song.' + ext)
                left = n
                with open(fp, 'wb') as f:
                    while left > 0:
                        chunk = self.rfile.read(min(1 << 20, left))
                        if not chunk:
                            break
                        f.write(chunk); left -= len(chunk)
                JOBS[job] = {'state': 'uploaded', 'path': fp, 'message': 'Uploaded'}
                return self.send_json(200, {'ok': True})
            data = json.loads(self.rfile.read(n) or b'{}')
            if u.path == '/api/room/join':
                code, cid = clean_code(data.get('room')), clean_id(data.get('id'))
                if not code or not cid:
                    raise RuntimeError('Enter a room code.')
                return self.send_json(200, room_join(code, cid, clean_name(data.get('name')), data.get('av')))
            if u.path == '/api/room/leave':
                room_leave(clean_code(data.get('room')), clean_id(data.get('id')))
                return self.send_json(200, {'ok': True})
            if u.path == '/api/room/send':
                msg = room_send(clean_code(data.get('room')), clean_id(data.get('id')), str(data.get('type')),
                                data.get('data') if isinstance(data.get('data'), dict) else {}, clean_id(data.get('to')) or None)
                return self.send_json(200, {'ok': True, 'msg': msg})
            if u.path == '/api/lg/start':
                return self.send_json(200, lg_start_game(clean_code(data.get('room')), clean_id(data.get('id')), data.get('song') if isinstance(data.get('song'), dict) else {}))
            if u.path == '/api/align/start':
                code, obj = start_align(data)
                return self.send_json(code, obj)
            if u.path == '/api/playlist':
                ids = [i for i in data.get('videoIds', []) if isinstance(i, str)]
                if not ids:
                    raise RuntimeError('The queue is empty.')
                return self.send_json(200, {'url': save_playlist(str(data.get('name') or 'Karaoke Night')[:100], ids)})
            return self.send_json(404, {'error': 'Not found'})
        except Exception as e:
            self.send_json(502, {'error': str(e)})

if __name__ == '__main__':
    port = int(os.getenv('PORT', 3000))
    print(f'Karaoke Night running at http://localhost:{port}')
    print('Page file:', find_page() or ('NOT FOUND. Put index.html in ' + PUB))
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
