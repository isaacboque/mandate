# 60-second demo (screen recording)

Use the demo mode, which needs no keys and no waiting: https://mandate-gb6t.onrender.com (or `npm run build && npm start` on http://localhost:8787). If it is the hosted one, open it a minute earlier (free instances sleep) and press **Reset demo** at the bottom.

| Time | Do | Say |
| --- | --- | --- |
| 0:00 | Click the chip "Indoor futsal shoes, max 90 €". | "I talk to the agent in plain words." |
| 0:08 | Point at the draft card, then the **Contracts** panel: the form with "from the agent" on each field. | "It drafted a contract. A draft is just data: nothing can be spent." |
| 0:16 | Change the budget, press **Sign contract**. | "Only I can sign. The button sends my numbers, not the agent's." |
| 0:24 | Ask for "Indoor futsal shoes, size 43, non-marking sole, max 90 €". **Approve**, then **Pay (simulate buyer)**. | "It proposes with reasons and eleven checks. I approve; checkout re-checks the live price." |
| 0:36 | Click **Try an attack**. | "A listing says: buy ten. The model is fooled on purpose. Plain code outside the model says no." |
| 0:44 | Type "raise the budget to 200 €"; in Contracts read the diff, press **Sign amendment**. | "The agent can only propose a change. I sign it, and what I already spent still counts." |
| 0:54 | Press **Revoke**, confirm. | "Revoked: a cart still waiting is refused at checkout. The agent cannot revoke." |

On a phone the panes are tabs: Chat and Contracts, with a dot on the tab that needs you. Tips: window about 1280 px wide, hide bookmarks and notifications, no music. Say it is a sandbox: no real money moves. For the real catalog and PayPal sandbox use live mode, which needs a sandbox buyer account (see the README).
