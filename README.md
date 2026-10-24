# Karaoke Night (YouTube edition)

Search songs on YouTube Music, queue them, and sing with time-synced lyrics while the video plays.

## Run it
1. Install Python 3.9+.
2. `pip install -r requirements.txt`
3. `python server.py`, then open http://localhost:3000 (friends on the same Wi-Fi can use your computer's local IP).

Searching and singing need **no login**. 

## How it works
- `ytmusicapi` searches YouTube Music (songs only).
- The song plays through YouTube's official embedded player; the lyrics follow the video's clock.
- Timed lyrics come from LRCLIB. Video versions can differ slightly from the lyric timing, so use the **Sooner / Later** buttons to nudge it.
- Scoring: up to 50 points from the mic plus 10 per star from friends.
- Some videos block embedding; the app tells you and you can skip to the next song.

## Optional: save the queue as a YouTube Music playlist
This is the `create_playlist` / `add_playlist_items` part of your snippet, behind the "Save queue" button. It needs a login:
1. Run `ytmusicapi oauth` once to create `oauth.json` in this folder.
2. Recent versions of ytmusicapi also need your own Google OAuth client (type "TVs and Limited Input devices", YouTube Data API v3 enabled). Pass it with the environment variables `YTM_CLIENT_ID` and `YTM_CLIENT_SECRET` when starting the server.

Keep `oauth.json` private; it gives access to your account.

## Notes
- `ytmusicapi` is unofficial and can break when YouTube changes things. The music itself is only played through YouTube's embed, never downloaded.
- LRCLIB lyrics suit private get-togethers. For public or commercial use, swap `synced_lyrics()` in `server.py` for a licensed provider.

## Syncing lyrics accurately
- **Mark buttons (any song):** click a lyric line, press **Mark picked line** the moment you hear it start, then mark a second line near the end. The app fixes the shift and the stretch. Your result is remembered for that song.
- **Preferences:** *Audio delay* compensates for Bluetooth and other late audio. *Show lines early* highlights each line a little before it is sung.


## Karaoke versions (no original singer)
Under the search box, **🎤 Karaoke versions** (on by default) swaps the original recording for a karaoke / instrumental upload from YouTube when you add a song to the queue. The queue shows "🎤 karaoke version" when one was found; if none is found the original plays and the status line says so. Rooms work too: the chosen karaoke video is stored with the queue item, so everybody plays the same one.
- **Lyrics stay tied to the original song.** Timed lyrics are still looked up with the original title, artist and length (`/api/lyrics`), so the lyric match is exactly what it was before. Only the video that plays changes.
- **Same song, same artist, same arrangement.** `/api/karaoke` (`find_karaoke` and `rank_karaoke` in `server.py`) searches YouTube for karaoke / instrumental videos and keeps only the ones that are really this song: the whole song title must be the video's title (so "Perfect" does not match "Perfect Symphony"), live / cover / remix / "with vocals" uploads are dropped, and "originally performed by" someone else is dropped. The length must be within `KARA_MAX_DIFF` (20 s) of the song, and an upload that does not name the artist (and is not from a known karaoke channel) must be within `KARA_SURE_DIFF` (6 s). Songs titled in another script need the artist's name or a known karaoke channel as well. The closest length goes first, then artist match, then known channels. If nothing passes, the original plays and the page says so, because playing a different song would be worse.
- **Timing is saved per video.** Shift and stretch are remembered for the karaoke video separately from the original, so fixing one never breaks the other. A karaoke track is never speed-stretched automatically (a length difference is usually extra intro or outro, which needs a shift); the page tells you when the track is more than 3 seconds longer or shorter than the lyrics' version. If the first line starts early or late, click it and press **Mark** when you hear it begin. It is remembered for that track in your browser.
- Turn the checkbox off to play original recordings as before.

- **If the original still plays:** that means no karaoke video passed the checks above, and the page says so when you add the song. Queued songs without one show a **🎤 Find karaoke** button to try again, and ticking the Karaoke versions box also switches the songs you already queued. The search tries four queries and reads lengths given as text.
- **See why a song has none:** open `http://localhost:3000/api/karaoke?title=SONG&artist=ARTIST&duration=SECONDS&debug=1`. It lists every video that was left out and the reason (no karaoke word in the title, different title, length too far off, search failed).

## Online rooms (friends in different places)
Everyone opens the same link, enters a name, and joins the same room code. The queue and scoreboard are shared, the song starts for everyone at the same moment (after a 5 second countdown), and the singer's microphone is streamed live to everyone else.

1. Run `python server.py` on your PC.
2. Give friends a public **https** link (microphones only work on https). Easiest: install Cloudflare's `cloudflared` and run `cloudflared tunnel --url http://localhost:3000`, then share the `https://...trycloudflare.com` address it prints. ngrok (`ngrok http 3000`) works too.
3. Open the link, type your name, leave the room code empty and press **Join / create room**. Press the **🌐 Room** button to copy an invite link, and send it to your friends.

Notes:
- Singers should wear **headphones**, or friends will hear the song twice (once from YouTube, once leaking into the mic).
- Each person's browser plays the YouTube video itself, so listeners can be about a second out of step with the singer. Listeners can lower or raise "Singer voice" on the singing page.
- Voice goes directly between browsers (WebRTC) using a public STUN server. A few strict networks (some school or office Wi-Fi, some mobile carriers) block this and would need a TURN server.
- Room data is kept in memory and is lost when the server restarts. "Save playlist" is for solo mode only.

### Ready check and countdown (rooms only)
After the singer has chosen the mode, pressing **Start the next song** in a room asks everyone "Are you ready?". The song begins, with a 5 second on-screen countdown, once every person has pressed **I'm ready!**. Anyone can press **Not yet** to cancel, and the check cancels itself after 30 seconds.

### Clearer voice
Settings has **Headphones mode** (on by default). It turns off the browser's echo canceller while you sing in a room, which is what usually chops a singer's voice up when music is playing. The voice is also sent as high-quality Opus audio with silence-skipping turned off. If you sing through speakers instead of headphones, turn Headphones mode off, otherwise friends will hear the song twice.

### Staying in sync
In a room the song position follows one shared clock (the server's). Every browser preloads the video during the ready countdown, starts it at the same moment, and re-seeks itself if it drifts more than about 0.7 seconds. If a tab was hidden or the video stalled, it jumps back to the right spot when you return. Expect everyone to be within roughly half a second of each other. Keep the karaoke tab visible while singing (mic scoring runs best in the foreground tab).

### Live mic controls while singing
The singer sees a **Mic level** slider on the singing page (also in Settings). In a room, friends hear the change immediately, because their audio is your mic after that gain, with a limiter to stop loud notes crackling. Changing the **Microphone** in Settings, or toggling Headphones mode, while singing switches the mic on the fly without cutting the stream.

### Lobby, song modes and auto-play (rooms)
- The **Lobby** card at the top of the side panel lists everyone in the room (name, look, mic status, who is singing, who is choosing a mode, who is ready). On phones, open it with the **Lobby & Queue** button.
- In a room you always queue songs as **yourself**, from your own device. There is no singer dropdown (that is only for same-device play, where one computer is shared by several people).
- **The mode is chosen at the start, before the ready check.** When someone presses **Start the next song** (or auto-play kicks in), the person whose song is next gets a window to choose **Solo**, **Duet** or **Tournament**, and a partner from the lobby. Everyone else sees "<name> is choosing the mode…". After that the "Are you ready?" check begins.
- **Duet:** the lines are shuffled at random between the two singers, with a few sung together, and your mic is only live on your own lines. Each gets their own score, no winner.
- **Tournament:** you choose who to fight, one person or several (up to 8 in total, or press **Fight everyone**). The lines are shuffled at random and your mic is only live on your lines. Each person is scored only on their own lines, and the highest total (score plus combo bonus) wins a 10-point bonus and a podium. A shared top score is a tie with no bonus.
- Only the named singer(s) can sing and score a song. Everyone else listens.
- About 8 seconds after a song ends, the next singer is asked to choose a mode automatically, followed by the ready check and 5 second countdown. If they do not choose within 45 seconds, the start is cancelled. The host can press **Skip for everyone** to move on at once; everybody else presses **Vote to skip**, and the song is skipped when more than half of the room has voted (a singer whose song has no synced lyrics is still skipped automatically).
- Voice chat in a duet or tournament needs both singers in **headphones**.

### Looks, reactions and audience stars (rooms)
- Everyone picks an emoji and a colour (in the join window or the "Who's here" card). It shows in the queue, scoreboard, who's-here list and the tournament line labels. Your choice is remembered on this browser.
- Listeners get reaction buttons (👏 🔥 ❤️ 😂 🎉 😮) under the lyrics. They float up everyone's screen.
- After a song, listeners can give 1 to 5 stars. The average becomes up to 10 bonus points for the singer(s). Votes can be changed until the next song starts.

### Voice chat across strict networks (TURN relay)
Voice goes directly between browsers. When two people are on strict networks (some mobile data plans, school or office Wi-Fi, some home routers), a direct link between *those two* cannot be made, even though both can reach a third person. The Lobby then shows **⚠ cannot connect** next to that person, and you will hear the others but not them.

The fix is a TURN relay, which passes the audio along when a direct link is impossible. Get TURN credentials from a TURN provider (several, such as Metered and Cloudflare, offer free tiers; check their current limits), then start the server with:

    set TURN_URL=turn:your-turn-host:3478,turns:your-turn-host:5349
    set TURN_USER=your-username
    set TURN_PASS=your-password
    python server.py

(On macOS or Linux use `export` instead of `set`.) Everyone who opens the page then uses the relay automatically when they need it. Do not share the credentials publicly.

The voice list under **Join voice chat** shows each person as connected (✓), connecting (…) or unable to connect (⚠). A stuck link is retried three times before it is reported.

### Low-latency voice (on by default)
**⚡ Low-latency voice** is in Settings and in the Mic test window, and takes effect immediately (turn it off if the voice crackles on weak Wi-Fi). It does three things:
- A smaller voice buffer (starts at 40 ms and can grow to 180 ms, instead of 100 ms growing to 300 ms), which grows only on real trouble and shrinks faster once the connection is calm.
- Shorter Opus packets (10 ms instead of 20 ms). This applies to the next song's connection.
- Tighter video sync: a device is re-aligned to the room clock when it drifts 0.35 s instead of 0.7 s.

### Listeners: music held back to match the singer's voice
A singer's voice reaches listeners a little late (network + voice buffer). Listeners' music is held back by that measured delay plus **Voice sync (when listening)** in Settings, so voice, music and lyrics line up. The lyrics follow the video, so they move with the music. Singers are never held back (it would add up between two singers). The Lobby line "Voice delay about … ms" also says how much the music is held back.

### Settings that apply right away
While a song is playing, changing the **Microphone**, or toggling **Headphones mode**, swaps the live microphone without stopping the song or reconnecting anyone (`public/js/live-settings.js`). If the new microphone cannot be opened, the old one keeps working. The voice chat microphone follows the same picker. The **Lyrics** display mode (original / romanized / both) also changes at once. Sliders such as Mic sensitivity, Song volume, Audio delay, Show lines early, Voice sync and lyric size were already live.

## Fair queue, stage looks, awards and end of night
- **Fair queue:** people take turns. Whoever sang longest ago (or never) goes next, and each person's own songs stay in the order they added them, so one person queuing five songs does not block everyone else. The queue list shows the real play order. This works in rooms and on one shared device.
- **Themes:** Neon club, Retro arcade and Starry sky, each with its own background and lyric glow. Pick one on the **home page** (the Theme card). It changes the look of the whole site, on every page and while you sing, and it is remembered on this browser. Each person uses their own theme, so friends in a room can have different ones.
- **Lyric styling:** words fill as they are sung and bounce a little on strong beats. The app cannot hear the YouTube music, so the bounce follows the loudest moments of the singing instead. The stage lights dim in quiet moments (instrumental gaps and soft singing). **Reduce motion** turns both off.
- **Avatars on stage:** the singer's emoji is shown large and glows and pulses with the voice. In duets and tournaments, the emoji of whoever owns the current line lights up. Listeners appear as a row of emoji under the lyrics, and their reactions float up from their own emoji. A **Crowd energy** meter fills with reactions and chat.
- **Combo:** every line you sing well in a row builds a combo. Your best streak gives up to 10 bonus points, shown on the result card.
- **Awards:** after each song, funny titles such as Pitch Perfect, Loudest Voice, Always Early, Non-Stop Singer, Combo Machine and Crowd Favourite are picked from your score breakdown, combo, audience stars and reactions.
- **Victory moments:** bigger confetti for high scores, and a podium after every tournament.
- **End of the night:** press **End the night** (next to the queue buttons) for the winner, the most-played singer, the best single performance and the crowd favourite. **Start a new night** clears scores and history.

### Starting together
When a song starts in a room, every browser first loads the lyrics and quietly pre-loads the video, then reports ready. The server sends one shared start time once everyone is ready (or after 15 seconds, so one slow device cannot hold up the room). A device that is still slow then catches up using the shared clock.

### Premium look (design layer)
All the extra visuals live in three new files, so the app's own code is untouched: `public/css/premium.css`, `public/js/premium.js` and `public/partials/ornaments.html`.
- **Spinning microphone:** a 3D gold wire-mesh microphone on the right of the welcome page. It turns slowly by itself. Drag it sideways to spin it faster (a flick shows its RPM and throws sparks), and it slowly coasts back to idle. Keyboard: focus it and press Space or Enter. A small copy sits next to the logo in the app, and glows red and spins faster while a song is playing.
- **Theatre set** on the welcome page: velvet curtains, a spinning vinyl record and a swinging mirror ball.
- **Glass cards, glowing buttons, drifting light dust and stage-floor glow** everywhere. The colours follow the stage theme (Neon club, Retro arcade, Starry sky).
- **Slow devices:** the page checks its own frame rate in the first few seconds and, if it is slow, switches to a lighter "lite" look automatically. To force it, run `localStorage.karaokeLite = '1'` (lite) or `'0'` (always the full look) in the browser console, then refresh.
- People who prefer reduced motion get a still page (the microphone still responds when dragged).
- To remove the layer completely, delete the `premium.css`, `premium.js` and `ornaments.html` lines in `public/index.html`.

### Countdown in the lyrics area
A big 3 · 2 · 1 appears over the lyrics so everyone knows when to come in: "Song starting…" while the music loads, "First line in 3, 2, 1" before the first lyric, and "Next line in…" after a long instrumental break (9 seconds or more between lines). It shows on every screen in the room, in fullscreen too. The styles are in `public/css/countdown.css` and the timing is in `public/js/singing.js` (`lyShow`).

## Romanized lyrics (Japanese kanji, Chinese, Russian, etc.)
Korean and Japanese kana are romanized in the browser. Kanji, Chinese pinyin and other scripts (Cyrillic, Greek, Arabic, Thai, Hindi...) are romanized by the server through `/api/romanize`, using the libraries in `requirements.txt`: `pip install -r requirements.txt`, then restart `server.py`. If one is missing, the page tells you which to install.
- Japanese: uses `cutlet` when installed (best: real word spacing and particles like は -> wa; `pip install cutlet unidic-lite`), otherwise `pykakasi`.
- A song with any kana is treated as Japanese; a song with only Han characters is treated as Chinese (pinyin with tone marks).

### Voice chat volume and mic threshold
- **Per person (Discord style):** hover over someone in the Lobby or the voice chat list (the box appears beside them), or click them to keep it open (click again to close). Right-click works too, and on a phone press and hold. Drag **User volume** from 0 to 100%. The same menu has Mute. It only changes what *you* hear and is remembered in your browser by the person's name.
- **Everyone:** the **Voice chat volume (everyone)** slider at the bottom of the voice chat panel goes from 0 to 200% (100% is normal; double-click resets it). Above 100% the sound goes through a limiter so it does not crackle. The "while someone sings" slider still ducks voice chat on top of this.
- **Meters:** each person in the voice chat list has a live level meter.
- **Mic threshold (Settings → Sound, and Mic test):** like Discord's input sensitivity. Your mic is muted while the live meter is left of the white line. 0 = off. It works together with Mic suppression and applies right away, even during a song.

### Mic suppression (Settings → Sound, also in Mic test)
For people with a TV, fans or family on other computers in the same room. It works for both singing and voice chat, takes effect straight away, and only changes what *your* mic sends (and what scores you).
- **Off:** raw microphone, no processing.
- **Standard (default):** how the app always worked.
- **Strong:** the browser's noise suppression, a voice-range filter, and a noise gate that learns the background and turns the mic down about 14 dB while you are not clearly louder than it.
- **Maximum:** a stricter gate (about 30 dB down) and a tighter filter.
The gate runs in an AudioWorklet (`public/js/suppress-worklet.js`, logic in `public/js/suppress.js`) and needs https or localhost, like the microphone itself. It cannot tell your voice from someone else's voice, so keep the mic close or wear headphones. If the start of words is clipped, use Strong instead of Maximum.

### Shared lyric timing (fix a karaoke track once, for everybody)
The timed lyrics match the original recording, and a karaoke track usually has a different intro, so the lyrics can start early or late on it. Nothing can measure that automatically (the app never downloads the audio), so it is fixed by ear: click a lyric line and press **Mark** when you hear it begin, or use **Sooner / Later**.
- **Saved on the server.** The fix is stored in `timing.json` (next to `server.py`) for that exact video and lyrics version, and used automatically for everybody the next time the song is played. The page says "Using the lyric timing that was already fixed for this track".
- **Live in a room.** When the singer (or the host) changes the timing, everyone in the room gets it immediately, so listeners no longer have to adjust their own. A listener's own nudges stay on their device only.
- **Reset timing** puts the shift back to 0 for that track. If a wrong fix was saved, fix it again or reset it. To wipe everything, delete `timing.json`.
- `/api/timing?v=VIDEOID&l=LYRICID` shows what is stored for a track.

## Settings, security and deploying (optional environment variables)

| Variable | What it does |
|---|---|
| `GEMINI_API_KEY` | Turns on the AI judge comment on the results screen (Google Gemini). `GEMINI_MODEL` picks the model. |
| `TRUST_PROXY` | `1` reads the visitor address from the proxy (`CF-Connecting-IP`). On by default on Render. |
| `RATE_SCALE` | Multiplies every rate limit (`2` = twice as generous, `0.5` = half). Limits only cover search, lyric timing, chat, joining rooms, playlists and romanizing, and are set well above normal use. |
| `MAX_ROOMS`, `MAX_ROOM_CLIENTS` | Caps on open rooms (default 400) and people per room (default 40). |
| `CSP` | `on` (default), `report` (log problems without blocking) or `off`. If something from a new site stops loading, try `report` first, then add that site to `csp_value()` in `server.py`. |
| `JUDGE_LIMIT` | Optional cap on judge comments per visitor per 10 minutes (default: no limit). |

The server sends compressed files with ETags (a page reload re-downloads nothing that has not changed), keeps connections open, and sets security headers. Lyric-timing fixes are shared by everyone, so the value people see is the median of the latest fixes from different visitors; one visitor cannot overwrite it. On Render, start with `python server.py` and add your variables under Environment.

