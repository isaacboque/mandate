# Configuration

Everything is configured with environment variables: in a local `.env` file (copy `.env.example`; `.env` is git-ignored) or in your host's environment settings. Nothing is configured in the browser, and no secret ever leaves the server.

Check your setup at any time:

```bash
npm run doctor        # reads the environment the way the server will; prints what will answer and what is missing. Shows whether a secret is set, never its value.
```

## Bring your own model key

Mandate works with no key (an offline rules agent answers, fully deterministic). To put a real language model behind the chat, set **the key of the provider you use**. That is all: the provider is detected from the key.

| Provider | Variable | Default model | Notes |
| --- | --- | --- | --- |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` | Free tier available in Google AI Studio |
| OpenAI | `OPENAI_API_KEY` | `gpt-4.1-mini` | `OPENAI_BASE_URL` points it at any OpenAI-compatible endpoint |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` | |
| Groq | `GROQ_API_KEY` | `openai/gpt-oss-120b` | Free tier, no card: the public demo uses it |

```bash
cp .env.example .env
# edit .env: set ONE key, for example
#   GROQ_API_KEY=...
npm run doctor        # Agent: groq / openai/gpt-oss-120b (key from GROQ_API_KEY)
npm run build && npm start
```

Rules, in this order:

1. **One key set:** that provider is used, with its default model.
2. **Several keys set:** the first of Google, OpenAI, Anthropic, Groq is used and the start-up line says so. Set `LLM_PROVIDER` to choose another.
3. **`LLM_PROVIDER`** (`google`, `openai`, `anthropic` or `groq`) chooses the provider explicitly. If its key is missing the server starts with the offline agent and says exactly which variable to set (it does not wait for the first visitor's first question to fail).
4. **`LLM_MODEL`** overrides the default model of the chosen provider.
5. An empty or blank value counts as not set, so copying `.env.example` as it is changes nothing.

What you can see: the header badge ("Model: gpt-oss-120b via Groq (free tier)" or "Offline agent (no LLM)"), the start-up log line, and `GET /api/health` (`agent`, `model`, `provider`; never a key).

### Why visitors cannot paste a key into the page

A key typed into a public page would travel through the browser, the network and the logs of a shared server. Mandate keeps keys on the server, in the environment of whoever runs it. If you want people to use their own key, they run their own copy (`git clone`, set the key, `npm start`): nothing else to install, no account.

### If the model fails

A configured model that fails never silently hands the turn to the offline agent (see [AGENT-SPEC.md](AGENT-SPEC.md), Failure semantics): the person sees what happened (a usage limit, a timeout, a bad key...) and nothing is proposed. Switching to the offline agent is a button the person presses, per session.

## Reference

| Variable | Default | What it does |
| --- | --- | --- |
| `DEMO_MODE` | `mock` | `mock`: fixture catalog and simulated payments, no keys needed. `live`: Channel3 catalog and PayPal sandbox |
| `CURRENCY` | `EUR` | Display and mandate currency |
| `PORT` | `8787` | HTTP port |
| `CHANNEL3_API_KEY` | | Live mode: product catalog ([trychannel3.com](https://trychannel3.com), free tier) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | | Live mode: a PayPal **sandbox** app (Orders v2). Sandbox only: no real money moves |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` | | Model keys, see above. Any one is enough |
| `LLM_PROVIDER` | detected from the key | `google`, `openai`, `anthropic` or `groq` |
| `LLM_MODEL` | provider default | Model id of the chosen provider |
| `OPENAI_BASE_URL` | | Any OpenAI-compatible endpoint for the `openai` provider |
| `LLM_TIMEOUT_SECONDS` | `40` | Longest wait for one model call; then the turn fails closed |
| `LLM_DAILY_TURN_BUDGET` | `150` | Model turns per UTC day for the whole server (`0` = no limit). Past it, visitors see the "quota used up" card without a provider call. Protects a free quota |
| `PUBLIC_SITE_ORIGIN` | `https://isaacboque.github.io` | The one origin (the static landing page in `site/`) that may read `/api/health` from a browser. Only that route, never credentials; a wildcard or a value that is not a plain origin is ignored |
| `TRUSTED_PROXIES` | `0` | How many proxies of your own sit in front of the app (Render: `1`); `0` ignores `X-Forwarded-For` |
| `RATE_LIMIT_ASKS_PER_HOUR` | live `12`, demo `0` | Searches per visitor per hour (`0` = off) |
| `DAILY_ASK_CAP` | live `300`, demo `0` | Searches per day for the whole instance (`0` = off) |
| `RATE_LIMIT_CATEGORIES_PER_HOUR` | live `120`, demo `0` | Category look-ups per visitor per hour (`0` = off) |
| `SESSION_TTL_MINUTES` | `120` | A visitor's in-memory session is dropped after this long idle |
| `MAX_SESSIONS` | `300` | Most sessions kept at once; the oldest idle one is dropped first |
| `TRACE_RETENTION_HOURS` | `24` | Trace files older than this are deleted at start-up and hourly (`0` keeps them) |
| `APP_URL` | host URL | Where PayPal sends the buyer back to (Render sets `RENDER_EXTERNAL_URL` itself) |

Hosting on Render: `render.yaml` declares the non-secret variables and an empty `GROQ_API_KEY` slot; set the key in the Render dashboard. Never put a key in a file that is committed.
