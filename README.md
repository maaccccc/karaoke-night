# Karaoke Night

[![Latest release](https://img.shields.io/github/v/release/maaccccc/karaoke-night-app?label=latest&color=ff9a56)](https://github.com/maaccccc/karaoke-night-app/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/maaccccc/karaoke-night-app/total?color=3be58a)](https://github.com/maaccccc/karaoke-night-app/releases)
[![Source code](https://img.shields.io/badge/source-open-blue)](https://github.com/maaccccc/karaoke-night)

Sing with time-synced lyrics, live scoring and friends, on one device or across the world. A free project, made for fun.

**This repository hosts the Windows installer. The full source code is open: [github.com/maaccccc/karaoke-night](https://github.com/maaccccc/karaoke-night).** You can read exactly what the app does, or run it yourself without installing anything.

## Download

| Device | Download |
|--------|----------|
| **Windows PC** | [KaraokeNight-Setup.exe](https://github.com/maaccccc/karaoke-night-app/releases/latest/download/KaraokeNight-Setup.exe) |

All versions and what changed: see [**Releases**](https://github.com/maaccccc/karaoke-night-app/releases) and the [changelog](CHANGELOG.md).

Prefer not to install anything? Run the server from source (Python 3.9+) and open it in your browser. Steps are in the [source README](https://github.com/maaccccc/karaoke-night#run-it).

## What you can do

- Search any song and sing it with lyrics that follow the music. Karaoke versions are picked automatically when they exist.
- Live scoring while you sing, in **Solo**, **Duet** and **Tournament** modes.
- Rooms with friends: shared queue, scoreboard, voice chat and vote-to-skip.
- Playlists, favourites and your singing history, stored on your device.
- Hear-yourself echo and reverb when singing without a room.

## Installing

**Windows.** Run the installer. If Windows shows *"Windows protected your PC"*, choose **More info**, then **Run anyway**. The app is not signed with a paid certificate, so Windows does not recognise it yet. After the first install the app **updates itself**: new versions download quietly and install the next time you close the app.

### Checking your download

Don't want to take the installer on trust? Two easy checks:

1. **Compare the checksum.** Each release lists the SHA-256 of the installer. In PowerShell:
   ```
   Get-FileHash .\KaraokeNight-Setup.exe -Algorithm SHA256
   ```
   The result should match the value on the release page.
2. **Scan it** at [virustotal.com](https://www.virustotal.com) and compare the report with the release notes.

Because the source is public, you can also build the app yourself and compare.

## Privacy: what stays on your device and what doesn't

The full details are in the [source code](https://github.com/maaccccc/karaoke-night), but in plain language:

- **On your device only:** favourites, history, playlists, settings, lyric-timing tweaks you make, and your name/emoji choice. There are no accounts.
- **Your microphone** is used to score your singing and, in a room, to send your voice to the other people there. Voice goes directly between browsers (WebRTC); if two people can't connect directly, an optional relay server passes the audio along. Audio is not recorded or stored.
- **What the server sees:** room codes, the names you type, queue and chat messages (kept in memory and lost when the server restarts), and a one-way hash of a random per-browser ID so one device is treated as one seat. Lyric-timing fixes for a song are saved on the server so they help everyone.
- **Songs** play through YouTube's official embedded player. Lyrics come from LRCLIB. Nothing is downloaded or stored by the app.
- The app needs an **internet connection**: songs, lyrics and rooms all run online.

## Good to know

- Karaoke Night is not affiliated with or endorsed by YouTube, YouTube Music or LRCLIB.
- Wear **headphones** when singing in a room, or friends will hear the song twice.
- Some videos block embedding. The app tells you, and you can skip to the next song.

## Problems or ideas?

Open an [**Issue**](https://github.com/maaccccc/karaoke-night-app/issues/new/choose) and say which device you use and what happened. Code contributions and bug reports for the app itself are welcome in the [source repository](https://github.com/maaccccc/karaoke-night/issues). For security problems, please read [SECURITY.md](SECURITY.md) first.

## License

The installer is free to use for personal, non-commercial use. See [LICENSE](LICENSE). The source code is licensed separately; see the [source repository](https://github.com/maaccccc/karaoke-night).
