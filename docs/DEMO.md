# 60-second demo (screen recording)

**What answers.** The header badge says: "Model: gpt-oss-120b via Groq (free tier)" when the owner has set `GROQ_API_KEY` on the host, or "Offline agent (no LLM)" otherwise (`/api/health` reports the same, without a key). While a model works the chat says "Thinking with gpt-oss-120b…". A first-time visitor sees a "Try it in 60 s" strip that ticks the six steps below from the server's state; it can be hidden and disappears when all six are done.

**If the free quota is busy.** The free tier is small and shared. One model call runs at a time (others see "Waiting for the model…"), a short per-minute limit is retried once on the server ("The free model is busy, retrying in N s…"), and anything longer, or a used-up daily quota, shows a card: "This is a usage limit, not a bug. Nothing was proposed or spent." with **Try again** and **Use the offline agent for this session** (the person's choice, per session; the header then says "Offline agent (no LLM)" and offers "Back to the model"). A timeout, an invalid tool call or a bad key each get their own plain line, and none of them hands the turn to the offline agent by itself.

Use the demo mode, which needs no keys and no waiting. Share the landing page https://isaacboque.github.io/mandate/ (it wakes the server and opens the demo when ready); the demo itself is https://mandate-gb6t.onrender.com (or `npm run build && npm start` on http://localhost:8787). If it is the hosted one, open it a minute earlier (free instances sleep) and press **Reset demo** at the bottom.

| Time | Do | Say |
| --- | --- | --- |
| 0:00 | Click the chip "Indoor futsal shoes, max 90 €". | "I talk to the agent in plain words; one amount is enough." |
| 0:08 | Point at the draft card, then the **Contracts** panel: the form with "from the agent" on each field. | "It drafted a contract in one turn: 90 € is both the total and the per-item cap, and the card says so. A draft is just data: nothing can be spent." |
| 0:16 | Change the budget, press **Sign contract**. | "Only I can sign. The button sends my numbers, not the agent's." |
| 0:24 | Nothing to type: after you sign, the agent looks for what you asked by itself and a cart appears. **Approve**, then **Pay (simulate buyer)**. | "It proposes with reasons and eleven checks. I approve; checkout re-checks the live price." |
| 0:36 | Click **Try an attack**. | "A listing says: buy ten. The model is fooled on purpose. Plain code outside the model says no." |
| 0:44 | Type "raise the budget to 200 €"; in Contracts read the diff, press **Sign amendment**. | "The agent can only propose a change. I sign it, and what I already spent still counts." |
| 0:54 | Press **Revoke**, confirm. | "Revoked: a cart still waiting is refused at checkout. The agent cannot revoke." |

On a phone the panes are tabs: Chat and Contracts, with a dot on the tab that needs you. Tips: window about 1280 px wide, hide bookmarks and notifications, no music. Say it is a sandbox: no real money moves. For the real catalog and PayPal sandbox use live mode, which needs a sandbox buyer account (see the README).
