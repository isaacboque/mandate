# Deployment

How to run Mandate locally in each mode, and how the public demo is hosted. Environment variables are listed in [CONFIGURATION.md](CONFIGURATION.md).

## Demo mode (no keys)

`DEMO_MODE=mock` simulates payments and, by default, uses a fixture catalog (16 products, 3 of them poisoned, 1 whose price rises at checkout). Start it with `npm run build && npm start`, or `npm run dev` for development (API on :8787, UI on :5173). With no model key the offline rules agent answers; with one, the chosen model does. The header badge says which, and `/api/health` reports `agent` and the model id, never a key.

The hosted public demo (`render.yaml`) sets `CATALOG=channel3`: visitors search real Channel3 products while payments stay simulated. Add `CHANNEL3_API_KEY` (the same key as the live service) to the `mandate` service in the Render dashboard and redeploy; until then it falls back to the fixture catalog. The attack demo always uses its fixtures.

## Live mode (PayPal sandbox and Channel3)

Copy `.env.example` to `.env` and set:

```
DEMO_MODE=live
CHANNEL3_API_KEY=...             # free tier at trychannel3.com
PAYPAL_CLIENT_ID=...             # PayPal sandbox app (Orders / "Accept payments" enabled)
PAYPAL_CLIENT_SECRET=...
GROQ_API_KEY=...                 # optional: any one model key; without it the offline agent is used
```

Check each piece on its own first:

```bash
npm run smoke:channel3           # searches the real catalog, prints price and merchant
npm run smoke:orders             # creates a 1.00 EUR sandbox order, prints the buyer link, polls, captures
```

Then `npm run build && npm start`. **Approve** creates the PayPal order and shows the link; approve it with a sandbox personal (buyer) account, then press **Capture payment**. Price units from Channel3 are assumed to be decimal major units (49.99); `smoke:channel3` prints prices so you can confirm them with your key.

## Hosting on Render

`render.yaml` defines a free web service in demo mode. It also declares `LLM_PROVIDER=groq`, `LLM_MODEL=openai/gpt-oss-120b` and an empty `GROQ_API_KEY` slot: set the key in the Render dashboard to put a real model behind the demo (free tier, no card). `render.live.yaml` defines a second service in live mode. Keys are entered in the dashboard, never in the repository.

- **Free quota protection.** One model call runs at a time; `LLM_DAILY_TURN_BUDGET` (default 150 turns per UTC day) caps the day, and past it visitors see the "quota used up" card without a provider call. `LLM_MAX_QUEUE` (default 8) caps how many turns wait in line; past it a turn gets the "busy" card without a provider call. `LLM_TIMEOUT_SECONDS` (default 40) cuts off a model that does not answer; the turn then fails closed.
- **Per-visitor limits.** Searches are limited per visitor per hour and per day for the whole instance (`RATE_LIMIT_ASKS_PER_HOUR`, `DAILY_ASK_CAP`; 0 turns a limit off). They are on by default whenever a model is configured (10 per visitor per hour, and a day cap equal to `LLM_DAILY_TURN_BUDGET`), so one visitor cannot spend the whole model quota; with no model, mock mode stays unlimited. `render.yaml` sets both values explicitly: if the service does not sync from the blueprint, set them in the Render dashboard. A visitor is identified by the address Render's proxy appended to `X-Forwarded-For` (`TRUSTED_PROXIES=1`, the Nth entry from the right), never by the first entry, which a client can forge. With `TRUSTED_PROXIES=0` (the default) the header is ignored.
- **Sessions.** Each visitor has an HttpOnly cookie session; their mandate, budget, proposals and trace are not visible to anyone else. Sessions are in memory and expire after 2 hours idle. Trace files are deleted after `TRACE_RETENTION_HOURS` (default 24).
- **Return URL.** PayPal sends the buyer back to `APP_URL`, or Render's `RENDER_EXTERNAL_URL`.

## Cold starts: landing page and keep-alive

Render's free tier sleeps a service after 15 minutes without a request, and a request after that shows the host's own loading page for about 30 seconds. Two measures keep visitors from staring at it.

**Landing page.** `site/` is a static page (no build step) published to GitHub Pages by `.github/workflows/pages.yml`. It shows the demo video and polls `/api/health` every three seconds, then offers the live demo the moment the server answers; after 90 seconds without an answer it says so and gives the local command. The server allows cross-origin reads of `/api/health` only, from one origin (`PUBLIC_SITE_ORIGIN`, default `https://isaacboque.github.io`). One-time setup: repository *Settings → Pages → Source: GitHub Actions*, then run the `pages` workflow once.

**Keep-alive.** `.github/workflows/keep-demo-awake.yml` sends one `GET /api/health` every five minutes, at minutes that avoid :00, between 08:00 and 21:59 Madrid time (about 434 of Render's 750 free instance hours in a 31-day month). It is controlled by repository variables: `KEEP_DEMO_AWAKE` (`false` turns it off), `KEEP_DEMO_AWAKE_FROM` and `KEEP_DEMO_AWAKE_TO` (hours), `KEEP_DEMO_AWAKE_UNTIL` (last day, `YYYY-MM-DD`) and `DEMO_URL`. GitHub's schedule is best effort: runs can be late or dropped, so a few cold starts a day can still happen, which is what the landing page is for. `npm run keepalive:report` prints the largest gap between successful pings over the last 24 hours (needs the GitHub CLI, authenticated).
