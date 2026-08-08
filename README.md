# YourQ — Service Token Queue System

A simple token queue system for service counters. Customers take a token for a
service; staff at one or more desks call tokens in order; and a "Now Serving"
board shows, live, which token each desk is currently calling. Admins manage the
list of services (and how many desks each has) and download a daily report of
how many customers arrived per service.

## Pages

- **Home** — `http://localhost:3000/` — a landing hub with links to the four
  pages below (Take a Token, Now Serving, Desk Control, Admin).
- **Customer page** — `http://localhost:3000/customer` — grid of services. The
  customer taps a service, then presses **OK** to take a token. (Tap a different
  service before OK to change the choice.)
- **Now Serving board** — `http://localhost:3000/display` — open on a screen in
  the waiting area. For each service it shows every desk and the token that desk
  is currently calling. Updates live (instantly on a persistent server, or
  within ~2s on Netlify) whenever a desk calls or
  recalls a token. It also chimes: a two-tone "ding-dong" when a new token is
  called and a distinct triple-beep on a recall. Click **Enable sound** once
  (top-right) to allow audio — browsers block sound until you interact with the
  page.
- **Desk control** — `http://localhost:3000/desk` — for staff. Pick a service and
  you'll see all of its desks, each with **Call Next** and **Recall**:
  - **Call Next** serves the next waiting token (FIFO). A desk can't call past
    the last token taken — it shows "No one waiting" when the queue is caught up.
  - **Recall** re-announces the token that desk is already serving (flashes it on
    the board) without advancing the queue.
- **Admin page** — `http://localhost:3000/admin` — password-protected. Add or
  delete services, set how many desks each service has, and download a CSV report
  of customers served per service for any date.

All pages are rendered server-side by Express/EJS (`views/`), so the initial
state is baked into the HTML with no loading flash. Client JS (`public/js/`)
handles interactions and refreshes the live numbers (a persistent server pushes
instantly; on Netlify the pages poll every ~2s). Adding,
deleting, or changing a service (including its desk count) reloads the affected
pages so the server-rendered markup stays the source of truth.

## Setup

1. Install [Node.js](https://nodejs.org/) 18 or later.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy `.env.example` to `.env` and set your own admin password:
   ```
   copy .env.example .env
   ```
   Then edit `.env`:
   ```
   PORT=3000
   ADMIN_PASSWORD=your-own-password
   ```
4. Start the server:
   ```
   npm start
   ```
   (`npm run dev` runs the same thing but auto-restarts when you edit a file.)
5. Open the pages above in a browser. Since everything runs on your local
   machine, other devices on the same WiFi network can reach it too using your
   computer's local IP instead of `localhost` (e.g. `http://192.168.1.23:3000/`).

## Hosting it online

The app can be deployed two ways. **The code auto-detects where it runs** — no
edits needed.

### Option A — Netlify (serverless)

`netlify.toml` runs the whole app as one serverless function, serves the
CSS/JS statically, and stores data in **Netlify Blobs** (which persists across
restarts, unlike a function's disk). Live updates use a ~2-second poll instead
of WebSockets (serverless can't hold sockets open).

1. Push this repo to GitHub.
2. On [netlify.com](https://netlify.com): **Add new site → Import an existing
   project**, pick the repo. Netlify reads `netlify.toml`, so leave the build
   settings as detected (build `npm install`, publish `public`, functions
   `netlify/functions`). If the site was created earlier with different
   settings, clear any "Publish directory" / "Build command" overrides in
   **Site configuration → Build & deploy** so they match `netlify.toml`.
3. In **Site configuration → Environment variables**, add `ADMIN_PASSWORD`.
4. Deploy, then open the `https://…netlify.app/` URL.

### Option B — Render / Railway / Fly.io (persistent server)

These run the app as a normal long-lived server (`npm start`), which keeps
instant updates instead of polling and stores data in a file.

1. Push to GitHub.
2. On [render.com](https://render.com): **New → Blueprint** (reads
   `render.yaml`), or **New → Web Service** with build `npm install` / start
   `npm start`.
3. Set `ADMIN_PASSWORD` in the service's environment.
4. Open the `https://…onrender.com/` URL.

On free tiers the disk is *ephemeral*, so data resets on restart — attach a
persistent disk/volume and point `QUEUE_DB_PATH` at it (see `render.yaml`).

## How it works

- **Two counters per service, per day.** *Issued* counts tokens customers have
  taken; *called* is how far the desks have served. Call Next advances *called*
  (up to *issued*) and assigns that token to the calling desk. Both reset
  automatically at the start of a new day, so the first token each day is `#1`.
- **Multiple desks.** Each service has a number of desks set in admin. Every desk
  serves from the same FIFO queue but tracks the token it personally called, so
  the board can show "Token 15 → Desk 2".
- **Data** is stored in `data/db.json`, created automatically on first run. Set
  `QUEUE_DB_PATH` to store it elsewhere. Back it up to keep history beyond the
  daily report.
- **Deleting a service** removes it from the customer/desk/board pages but keeps
  its history so past daily reports stay accurate.
- **The daily report** is a CSV download (`Service,Customers Served`) for a date
  you pick, defaulting to today. "Served" counts tokens taken (customers arrived).
- **Colors.** Each service gets a distinct color (assigned in creation order)
  used consistently across the customer grid, board, desk page, and admin list.
  Pages are theme-aware and follow the device's light/dark setting.

## Notes

- Designed to run on one machine on a trusted local network (e.g. a shop or
  clinic counter). The admin login is a single shared password; the customer and
  desk pages are open on the local network. This is enough to keep casual
  visitors from editing services — not a substitute for real access control if
  the app is exposed to the internet.
