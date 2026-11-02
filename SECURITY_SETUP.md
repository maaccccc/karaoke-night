# Security setup (Render)

Set these under **Render → your service → Environment**. All are optional; the app works without them.

| Variable | What it does |
|---|---|
| `TRUST_PROXY` | Reads the visitor's address from Cloudflare's header. **Already on by default on Render** (Render sets `RENDER`). Never set it to `1` on a server that can be reached directly from the internet. |
| `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` | Cloudflare Realtime TURN: voice-chat relay for strict networks, with temporary passwords. Create a TURN key in the Cloudflare dashboard (Realtime → TURN) and paste its ID and API token. |
| `TURN_TTL` | How long a relay password lives, in seconds (default `21600` = 6 h, max `172800`). Keep it longer than your longest party. |
| `TURN_URL` + `TURN_SECRET` | Use your own coturn server (`use-auth-secret`) instead of Cloudflare. Passwords are made by this app. |
| `BAN_BY_IP` | `1` (default) also blocks a banned person's network address; `0` turns it off. |
| `IP_BAN_HOURS` | How long an address stays blocked (default `12`). |

**Check it worked:** open the service's *Logs* after a deploy. The first lines should read
`Visitor address: read from the proxy headers`, `Voice relay (TURN): Cloudflare, temporary passwords` and `Bans also block the address: yes, 12 hours`.

Notes
- Bans, rooms and rate limits live in memory, so they reset when Render restarts or spins down an idle free service.
- Cloudflare TURN is free up to 1,000 GB a month, then billed per GB. Add a billing alert in your Cloudflare account.
