# EL NIP GAME

**Draft a team. Invite your friends. Play a real competition. Watch every match unfold.**

A multiplayer football drafting and simulation game. One person creates a private competition and
shares a five-character code. Up to sixteen friends join, each drafts their own starting XI from
real squads, and the whole season plays out — human against human where the fixtures meet, AI for
every other club, with a full minute-by-minute simulation behind every result.

Heavily inspired by the drafting games in this genre; built from scratch with its own data
pipeline, its own rating model and its own simulation engine.

---

## The loop

```
CREATE COMPETITION → SHARE CODE → EVERYONE DRAFTS → SEASON RUNS → CHAMPION
```

1. **Create** — pick Premier League, La Liga, Champions League or World Cup. You get a room code.
2. **Invite** — share the code or the link. Friends pick a name and an avatar, and they're in.
3. **Draft** — your formation is rolled for you. A real squad spins up; you pick one player from
   it; another squad spins. Eleven picks, five rerolls. Only players who can legally fill one of
   your remaining positions are selectable, so a centre-back never ends up at striker.
4. **Play** — the host starts the competition. The full season is generated server-side and plays
   back matchday by matchday: your fixture front and centre, the other scores landing around it,
   the table reshuffling underneath. A 38-matchday season takes about two minutes.
5. **Win** — one of you lifts the trophy.

## Competitions

| Mode | Field | Format |
| --- | --- | --- |
| Premier League | 20 clubs | Double round robin, 38 matchdays, goal difference tiebreak |
| La Liga | 20 clubs | Double round robin, 38 matchdays, **head-to-head** tiebreak |
| Champions League | 36 clubs | 8-match league phase → knockout playoff → R16 → QF → SF → Final, two legs until the final |
| World Cup | 48 nations | Twelve groups of four → R32 → R16 → QF → SF → third place → Final, all at neutral venues |

Any club or nation nobody claims is drafted and played by AI, using exactly the same pool and the
same rules. The AI has no hidden advantages — difficulty changes how reliably it takes the best
option and how it spends rerolls, and nothing about the match itself.

---

## The football data

The dataset is built from public, properly licensed sources and stored completely separately from
the gameplay code, so it can be replaced or extended without touching a line of game logic.

| Source | Licence | What it gives us |
| --- | --- | --- |
| [Fantasy Premier League API](https://fantasy.premierleague.com/api/bootstrap-static/) | Public endpoint, factual data | Premier League 2025/26 squads, positions, birth dates, and real season performance (minutes, goals, assists, xG, xA, market price) |
| [Wikipedia](https://en.wikipedia.org) | CC BY-SA 4.0 | Current squads for La Liga, the Champions League field and the wider club pool; every World Cup, European Championship and Copa América squad list |
| [Wikidata](https://www.wikidata.org) | CC0 1.0 | Birth dates, nationality, playing position, and the article count used as a stature signal |

**Current contents:** 918 squads, 21,322 player-seasons, 184 teams, spanning every World Cup from
1930 to 2026.

### A note on the inspiration's dataset

The app this is modelled on advertises figures in the region of 2,300 squads and 79,000 players
across historical World Cups, La Liga, Ligue 1, Ligue 2 and Champions League seasons. That dataset
is private and its origin is not publicly documented — searching the App Store and Play listings,
the developer's own site and its FAQ turns up no published source, and no third party appears to
have identified one. Rather than claim an "exact" copy of something unverifiable, this project
builds an equivalent from sources whose provenance and licence are known. The ingestion pipeline is
designed to be extended: adding Ligue 1 and Ligue 2, or historical club seasons, is a config change
plus a run, not a rewrite.

### Season-aware players

A footballer is never one universal rating. Every record is a **player-season** tied to a specific
squad, so *Ronaldo, Brazil 2002* and *Ronaldo, Brazil 1998* are different cards with different
profiles, and a person is tracked across them by a stable `personId`.

### The rating model

The original's rating methodology isn't published, so this is an independent and deliberately
transparent model. It lives entirely in [`src/lib/core/ratings.ts`](src/lib/core/ratings.ts) so it
can be recalibrated without touching gameplay. It combines, in rough order of weight:

1. **Squad strength** — how good the team was that season.
2. **Stature** — the number of Wikipedia language editions covering the player. A crude-sounding
   proxy that turns out to track footballing significance remarkably well.
3. **Season performance** — real numbers where the data exists (Premier League points per 90, xG, xA).
4. **International record** — caps and international goals at the time of a tournament.
5. **Role and age** — starters rate above squad players, on a curve peaking at 27.

Output is a 40–99 overall plus attack, defence and goalkeeping, split by position.

---

## The match engine

Results are not random score generation. Every match is simulated minute by minute, and the score
emerges from separately modelled phases:

- **Possession** from midfield quality and playing style
- **Chance creation** from attack versus defence, scaled by possession, style, home advantage,
  game state (trailing teams push), stamina and any red cards
- **Chance quality** drawn from a beta distribution shaped by the attack/defence mismatch — most
  chances are poor, good teams get more of the good ones
- **Finishing** — a shot's chance of being a goal *is* its expected-goals value, adjusted for the
  goalkeeper and the finisher
- **Everything else** — fouls, bookings, second yellows, corners, offsides, penalties, saves,
  woodwork, extra time and shootouts

Formation, playing style and out-of-position penalties all feed in materially. Nothing is
hard-coded to a result.

### Calibrated against real football

`npm run test:sim` runs thousands of matches and reports the distributions. Current output:

```
goals per match      2.80   (real: ~2.70)
home wins            41.3%  (real: ~44%)
draws                29.3%  (real: ~25%)
away wins            29.3%  (real: ~31%)
shots per match      21.2   (real: ~24)
on target per match  8.5    (real: ~8.4)
yellows per match    4.0    (real: ~3.7)
reds per match       0.15   (real: ~0.12)

Top five squads v bottom five, 2000 matches:
  strong wins 50.6%   draws 25.1%   upsets 24.3%
```

Better squads win about twice as often as they lose. Upsets stay genuinely possible.

### Determinism, sync and replays

Every match is driven by one seeded RNG. Same squads, same tactics, same home team, same seed →
the same match, every time. That single property does a lot of work:

- **Human vs human matches are synchronised for free.** The competition is generated once on the
  server; both players read the same stored result, so there is no chance of two clients
  simulating different games.
- **Replays re-run nothing random.** Opening a match regenerates its timeline from the stored seed,
  which is byte-identical to what was played. You can scrub, pause and restart it.
- **Storage stays small.** Only the seed and a compact summary are persisted per match, not tens of
  thousands of events.
- **Tests can assert on exact outcomes.**

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The dataset is committed, so it works immediately. To rebuild it from source:

```bash
npm run ingest:all   # FPL + Wikipedia + Wikidata, then normalise into data/dist
```

Ingestion is polite (paced, identified user-agent), cached on disk and resumable — re-running only
fetches what's missing. Imports are idempotent.

### Tests

```bash
npm test             # 30 tests: scheduling, tables, tiebreaks, draft legality, determinism,
                     # extra time, penalties, UCL/World Cup advancement, dataset integrity
npm run test:sim     # long-run distribution check against real football benchmarks
```

---

## Deploying to Vercel

Import the repo at [vercel.com/new](https://vercel.com/new), then open the project's **Storage**
tab and create a **Neon** Postgres database on the free plan. Vercel injects `DATABASE_URL`
automatically; redeploy once and multiplayer is live. Full walkthrough in
[DEPLOY.md](DEPLOY.md).

The database is the only thing multiplayer needs. There are no WebSockets and no realtime
service: the lobby polls every two seconds, and the season is generated in one deterministic pass
when the host starts it, so playback is pure presentation and two players watching the same match
are reading the same stored result. Without `DATABASE_URL` the app falls back to an in-process
store — fine locally, and the home screen says so, but rooms won't be shared between serverless
instances.

---

## Architecture

```
src/lib/core/       Pure game logic — no I/O, no framework, fully testable
  rng.ts            Seeded RNG: uniform, weighted, normal, beta
  types.ts          Domain types
  ratings.ts        The rating model (swap this to recalibrate)
  formations.ts     Seven formations as data, plus position eligibility
  team.ts           Resolve a draft into team attributes; playing styles
  match.ts          The minute-by-minute engine, extra time, shootouts
  schedule.ts       Round robin, league phase draw, tables and tiebreaks
  knockout.ts       Brackets, two-legged ties, UCL and World Cup qualification
  draft.ts          Draft loop, reroll, auto-pick, AI drafting
  competition.ts    Generates and simulates a whole competition

src/lib/data/       Dataset loading and querying (read-only)
src/lib/server/     Rooms, sessions, Postgres/memory store
src/app/            Next.js App Router — pages and API routes
scripts/ingest/     The data pipeline
data/dist/          The committed dataset
tests/              Unit tests and the calibration harness
```

Gameplay logic has no dependency on the framework, the database or the dataset format.

### Design

Neo-brutalist: hard edges, 3px borders, flat colour, oversized numbers, strong display type, no
pills, no glassmorphism, no gradients. Built mobile-first, because most people will join from a
link on their phone.

---

## Licence and attribution

Game code is original. Football data is derived from the sources listed above, each used within its
licence; Wikipedia-derived content is CC BY-SA 4.0. No proprietary source code, private database or
unlicensed asset from any commercial game is used. Club crests and national flags are rendered as
generated colour marks rather than official artwork; the asset mapping is centralised so licensed
imagery can be dropped in.
