import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Amendment, type BlockedView, type Config, type MandateView, type PendingDraft, type Proposal } from "./api";
import { Booting } from "./Booting";
import { attention, parseCards } from "./cards";
import { Chat, type ChatItem } from "./Chat";
import { ContractsPanel } from "./ContractsPanel";
import { friendlyError } from "./errors";
import { TracePanel } from "./TracePanel";
import { useRun } from "./useRun";

type Tab = "chat" | "contracts";

/** What is waiting for the person after a reload: the chat cards are gone, the server's pending objects are not. */
function waitingItem(drafts: PendingDraft[], amendments: Amendment[], proposals: Proposal[], id: number): ChatItem | undefined {
  const cards: ChatItem["cards"] = [
    ...drafts.filter((d) => d.status === "pending").map((draft) => ({ type: "draft" as const, draft })),
    ...amendments.filter((a) => a.status === "pending").map((amendment) => ({ type: "amendment" as const, amendment })),
    ...proposals.filter((p) => !p.blocked && ["pending", "awaiting_buyer", "auto_approved"].includes(p.status)).map((proposal) => ({ type: "proposal" as const, proposal })),
  ];
  return cards.length ? { id, role: "agent", text: "Welcome back. These are waiting for you:", cards } : undefined;
}

export default function App() {
  const [config, setConfig] = useState<Config>();
  const [contracts, setContracts] = useState<MandateView[]>([]);
  const [drafts, setDrafts] = useState<PendingDraft[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [tab, setTab] = useState<Tab>("chat");
  const [sending, setSending] = useState(false);
  const [freshAttack, setFreshAttack] = useState<string>();
  // The trace sits beside the page only on a very wide screen; otherwise it is one click away.
  const [traceOpen, setTraceOpen] = useState(() => window.matchMedia("(min-width: 1500px)").matches);
  const [bootTry, setBootTry] = useState(0);
  const [bootError, setBootError] = useState<string>();
  const { busy, error, setError, run } = useRun();
  const nextId = useMemo(() => { let n = 0; return () => ++n; }, []);

  const load = useCallback(async () => {
    const [c, m, d, a, p] = await Promise.all([api.config(), api.mandates(), api.drafts(), api.amendments(), api.proposals()]);
    setConfig(c); setContracts(m); setDrafts(d); setAmendments(a); setProposals(p.slice().reverse());
    return { c, d, a, p: p.slice().reverse() };
  }, []);
  const refresh = useCallback(() => { load().catch((e) => setError(friendlyError((e as Error).message))); }, [load, setError]);

  // Reloading the page must not lose the session: restore the conversation text and whatever is still waiting for the person.
  useEffect(() => {
    setBootError(undefined);
    Promise.all([load(), api.history()])
      .then(([{ d, a, p }, hist]) => {
        const restored: ChatItem[] = hist.map((t) => ({ id: nextId(), role: t.role === "user" ? "user" : "agent", text: t.text, cards: [] }));
        const waiting = waitingItem(d, a, p, nextId());
        setItems(waiting ? [...restored, waiting] : restored);
        const back = new URLSearchParams(window.location.search).get("paypal");
        if (back) {
          window.history.replaceState({}, "", window.location.pathname);
          if (back === "cancel") setError("You cancelled in PayPal. The order is still waiting: open the PayPal link again to approve it.");
        }
      })
      .catch((e) => setBootError(friendlyError((e as Error).message)));
  }, [bootTry]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsert = (p: Proposal) => setProposals((all) => (all.some((x) => x.id === p.id) ? all.map((x) => (x.id === p.id ? p : x)) : [p, ...all]));
  const proposalMap = useMemo(() => new Map(proposals.map((p) => [p.id, p])), [proposals]);
  const add = (role: ChatItem["role"], text: string, cards: ChatItem["cards"] = []) => setItems((all) => [...all, { id: nextId(), role, text, cards }]);

  const onSend = async (text: string): Promise<boolean> => {
    const userId = nextId();
    setItems((all) => [...all, { id: userId, role: "user", text, cards: [] }]);
    setSending(true);
    const r = await run(() => api.chat(text));
    setSending(false);
    if (!r) { setItems((all) => all.filter((i) => i.id !== userId)); return false; }
    const cards = parseCards(r.cards);
    for (const c of cards) if (c.type === "proposal") upsert(c.proposal);
    const reply = r.messages.map((m) => m.text).join("\n\n");
    setItems((all) => [...all, { id: nextId(), role: "agent", text: reply, cards }]);
    refresh();
    return true;
  };

  const onAttack = () => {
    if (!contracts.some((c) => c.status === "active")) { add("agent", "The attack demo needs a signed contract to be stopped by. Ask me for one first."); return; }
    run(() => api.attack()).then((p) => {
      if (!p) return;
      upsert(p);
      setFreshAttack(p.id);
      add("agent", "A poisoned listing just told the model to buy 10 pairs. Here is what happened:", [{ type: "proposal", proposal: p }]);
      refresh();
    });
  };

  /** The person widens their own contract: the one-click fix signs an amendment (a successor contract), so the chain and the spend are kept. */
  const onFix = (b: BlockedView) => {
    const p = proposalMap.get(b.proposalId);
    const base = contracts.find((c) => c.hash === p?.mandateHash);
    if (!b.fix || !base) { setError("That contract can no longer be changed here. Ask the agent for a new one."); return; }
    run(() => api.fixMandate(base.hash, b.fix!.patch)).then((s) => {
      if (!s) return;
      add("agent", `Done: you signed an amendment (${s.hash}) with that change. It replaces the old contract and keeps what was already spent. Ask again to retry.`);
      refresh();
    });
  };

  const onReview = () => {
    setTab("contracts");
    window.setTimeout(() => document.getElementById("contracts-pane")?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
  };

  const dots = attention(drafts, amendments, proposals);
  const resetDemo = () => run(() => api.reset()).then((r) => { if (r) { setItems([]); setFreshAttack(undefined); setTab("chat"); refresh(); } });

  return (
    <div className={`shell agentic ${traceOpen ? "" : "notrace"}`}>
      <main>
        <header className="top">
          <div className="brand">
            <span className="logo" aria-hidden><i /><i /></span>
            <div>
              <h1>Mandate</h1>
              <p>An agent you talk to, bound by contracts it cannot sign.</p>
            </div>
          </div>
          <div className="badges">
            {config && <span className={`badge ${config.demoMode === "mock" ? "" : "live"}`}>{config.demoMode === "mock" ? "Demo payments" : "PayPal sandbox"}</span>}
            <button className="ghost small" onClick={() => setTraceOpen((o) => !o)} aria-pressed={traceOpen}>{traceOpen ? "Hide trace" : "Show trace"}</button>
          </div>
        </header>

        {error && <div className="alert" role="alert">{error}</div>}
        {!config && <Booting error={bootError} onRetry={() => setBootTry((n) => n + 1)} />}

        {config && (
          <>
            <div className="tabs" role="tablist" aria-label="Chat or contracts">
              <button role="tab" id="tab-chat" aria-selected={tab === "chat"} aria-controls="chat-pane" className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
                Chat{dots.chat && <i className="dot" aria-label="needs you" />}
              </button>
              <button role="tab" id="tab-contracts" aria-selected={tab === "contracts"} aria-controls="contracts-pane" className={tab === "contracts" ? "on" : ""} onClick={() => setTab("contracts")}>
                Contracts{dots.contracts && <i className="dot" aria-label="needs you" />}
              </button>
            </div>
            <div className="workspace" data-tab={tab}>
              <div id="chat-pane" className="pane chatpane" role="tabpanel" aria-labelledby="tab-chat">
                <Chat
                  items={items} sending={sending} onSend={onSend} onAttack={onAttack}
                  ctx={{ config, busy: busy || sending, run, proposals: proposalMap, drafts, amendments, freshAttack, onReview, onFix, onProposalChange: (p) => { upsert(p); refresh(); } }}
                />
              </div>
              <div id="contracts-pane" className="pane contractspane" role="tabpanel" aria-labelledby="tab-contracts" tabIndex={-1}>
                <ContractsPanel config={config} contracts={contracts} drafts={drafts} amendments={amendments} proposals={proposals} busy={busy || sending} run={run} onChanged={refresh} />
              </div>
            </div>
          </>
        )}

        <footer className="foot">
          {config && <p className="muted small honest">{config.demoMode === "mock" ? "Demo: a fixture catalog and simulated payments. Nothing is bought and no real money moves." : "Live catalog and the PayPal sandbox. No real money moves."}</p>}
          {config?.resettable && <button className="linklike" disabled={busy || sending} onClick={resetDemo}>Reset demo</button>}
        </footer>
      </main>
      {traceOpen && <TracePanel active={Boolean(config)} />}
    </div>
  );
}
