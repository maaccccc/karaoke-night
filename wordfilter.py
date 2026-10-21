"""Karaoke Night word filter.

Blocks racist / hateful slurs and hate slogans in display names and chat.
Ordinary swearing is deliberately NOT blocked.

How it matches (so lookalike tricks and innocent words are handled):
  * text is lowercased, accents / invisible characters are stripped and common
    lookalike letters are folded (n1gg3r, n.i.g.g.e.r, nnniiigggeeer, cyrillic a/e/o...)
  * STRICT words match anywhere (even inside another word) and even with spaces
    or dots between the letters. Only use this for words that are never innocent.
  * WORDS must stand alone as a whole word (so "Pakistan", "cocoon" and "Nigeria"
    are fine). Optional endings (s, ed, er, ...) are written in the list below.
  * PHRASES are hate slogans / threats.
  * ALLOWED are innocent words that would otherwise trip a strict match.

To tweak the filter, edit the lists below. Run `python wordfilter.py` to self-test.
"""
import re, unicodedata

# Matched anywhere, with optional spaces/punctuation between letters.
STRICT = [
    'nigger', 'nigga', 'niggah', 'nigguh', 'faggot',
]

# Matched as a whole word (letters may be stretched: "chiiink"). Value = optional ending(s).
WORDS = {
    'nigra': '', 'chink': 's', 'gook': 's', 'spic': 's', 'spick': 's', 'wetback': 's',
    'beaner': 's', 'coon': 's', 'jigaboo': 's', 'kike': 's', 'paki': 's', 'wop': 's',
    'dago': 's', 'towelhead': 's', 'raghead': 's', 'tranny': '', 'trannies': '',
    'fag': 's', 'retard': 's|ed',
}

# Phrases (spaces in a phrase match any run of spaces/punctuation).
PHRASES = [
    'heil hitler', 'sieg heil', 'white power', 'white pride', 'white supremacy',
    'go back to africa', 'porch monkey', 'camel jockey', 'race traitor',
    r'(kill|gas|hang|lynch) (all )?(the )?(jews|blacks|niggers|muslims|gays|asians|mexicans|whites)',
    r'(jews|blacks|muslims|gays|asians|mexicans) (should|must|need to) (all )?(die|burn|hang)',
    r'(i )?hate (all )?(the )?(jews|blacks|muslims|asians|mexicans|gays)',
]

# Innocent words containing a strict word.
ALLOWED = ['snigger', 'sniggers', 'sniggered', 'sniggering']

# Numeric hate codes, checked on the raw text.
CODES = [r'(?<!\d)1488(?!\d)', r'(?<!\d)14/88(?!\d)']

_LOOK = {'@': 'a', '$': 's', '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '+': 't',
         '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0445': 'x', '\u0443': 'y',
         '\u0456': 'i', '\u0442': 't', '\u0131': 'i'}


def _fold(text, leet):
    t = unicodedata.normalize('NFKD', str(text or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) not in ('Mn', 'Cf', 'Cc'))
    t = ''.join(_LOOK.get(c, c) if (leet or ord(c) > 127) else c for c in t)
    t = re.sub(r'[^a-z0-9]+', ' ', t)
    return ' ' + re.sub(r'\s+', ' ', t).strip() + ' '


def _stretch(word, sep=''):
    return sep.join(re.escape(c) + '+' for c in word)


_strict = re.compile('|'.join(_stretch(w, r'\s*') for w in STRICT))
_words = re.compile(r'(?<![a-z0-9])(?:' + '|'.join(
    _stretch(w) + (r'(?:' + e + r')?' if e else '') for w, e in WORDS.items()) + r')(?![a-z0-9])')
_phrases = re.compile('|'.join(r'(?<![a-z0-9])' + p.replace(' ', r'\s+') + r'(?![a-z0-9])' for p in PHRASES))
_codes = re.compile('|'.join(CODES))
_allowed = re.compile(r'(?<![a-z0-9])(?:' + '|'.join(map(re.escape, ALLOWED)) + r')(?![a-z0-9])')


def is_blocked(text):
    """True if the text contains a racist/hateful slur or slogan."""
    if not text:
        return False
    if _codes.search(str(text)):
        return True
    for leet in (False, True):
        t = _allowed.sub(' ', _fold(text, leet))
        if _strict.search(t) or _words.search(t) or _phrases.search(t):
            return True
    return False


if __name__ == '__main__':
    bad = ['n1gg3r', 'N.I.G.G.E.R', 'nnniiiggger', 'xXniggaXx', 'you are a f4ggot', 'chiiink', 'go back to africa',
           'Heil Hitler', 'white  power', 'kill all jews', '1488', 'sp1c', 'тowelhead', 'n i g g a']
    good = ['Nigeria', 'Niger', 'Scunthorpe', 'Dickson', 'Mike', 'cocoon', 'Pakistan', 'Spice Girls', 'Chinook',
            'snigger', 'shit', 'fuck this song', 'damn', 'ass', 'bitch please', 'Singer1', 'Raggedy', 'Wopper',
            'I love this song!', 'DJ Faggio', 'Mike 2024', 'Pakistani', 'Coonan']
    fails = [t for t in bad if not is_blocked(t)] + [t for t in good if is_blocked(t)]
    print('OK: all %d checks passed' % (len(bad) + len(good)) if not fails else 'FAILED: %s' % fails)
