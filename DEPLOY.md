# Deploying to Vercel

The short version: **import the repo, add a Postgres database, deploy.** Two of those three
steps are one click each.

---

## 1. Import the repo

1. Go to [vercel.com/new](https://vercel.com/new).
2. Pick `eb1386/footygame`.
3. Leave every setting alone — it's a stock Next.js app, so the framework, build command and
   output directory are all detected.
4. Click **Deploy**.

It will build and go live. At this point the game runs, but **multiplayer will not work
properly yet** — see the next step.

## 2. Add a database (this is what makes multiplayer real)

Rooms have to live somewhere every server instance can see. On Vercel each request can land on a
different serverless instance, so anything kept in memory is invisible to the next request. A
Postgres database fixes that, and it's free.

**Easiest option — Neon through the Vercel marketplace:**

1. Open your new project in Vercel.
2. **Storage** tab → **Create Database** → **Neon** (Postgres).
3. Accept the free plan and click through.
4. Connect it to the project when prompted.

That's it. Vercel injects `DATABASE_URL` and `POSTGRES_URL` into the project automatically, the
app picks either one up, and the schema is created on the first request. Nothing to run by hand.

**Supabase** works identically if you prefer it — same Storage tab, same result.

**Bringing your own Postgres?** Add an environment variable named `DATABASE_URL` under
Settings → Environment Variables, set to your connection string. Any Postgres 12+ works.

## 3. Redeploy

After adding the database, trigger one redeploy (Deployments → ⋯ → Redeploy) so the new
environment variables are picked up. Done.

---

## How to tell whether it's working

Open the home screen. If you see a yellow banner saying storage is in memory, the database is not
connected — check that `DATABASE_URL` exists in the project's environment variables and that you
redeployed after adding it. No banner means Postgres is live.

The real test: open the site in a normal window and a private window, create a room in one, and
join it with the code in the other. Both should see each other in the lobby within a couple of
seconds.

---

## How the multiplayer actually works

Worth knowing, because it explains why the setup is this simple.

There are no WebSockets and no separate realtime service. Two things make that work:

**1. The lobby and draft poll.** While people are joining and drafting, each client asks the
server for the room state every two seconds. That is more than fast enough to watch names and
draft progress appear, and it works on serverless with no special infrastructure.

**2. The season is generated once, up front.** When the host starts the competition, the server
simulates the *entire* thing — every fixture, every result — in about 50 milliseconds, and stores
it. Playback is then pure presentation: your browser reveals results that already exist. Two
players watching the same match are reading the same stored result, so they cannot possibly
diverge. Full minute-by-minute timelines are regenerated on demand from each match's stored seed,
which is exact because the engine is deterministic.

This is why a 38-matchday season plays out in about two minutes, and why nobody ever waits on
anyone else's connection.

### Concurrency

Room writes use optimistic version checks: read the room, apply the change, write it back only if
the version hasn't moved, retry if it has. Two friends tapping "join" at the same instant both get
a seat.

---

## Custom domain

Vercel project → **Settings** → **Domains** → add yours. Invite links use whatever host the page
is served from, so they pick up the custom domain automatically with no configuration.

## Costs

Free tier is fine. The app is small, the dataset is static and read from disk, and generating a
whole season is one short burst of CPU rather than a long-running process. Neon's free Postgres is
comfortably enough for a group of friends.
