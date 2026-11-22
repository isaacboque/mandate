/**
 * Drives the whole web flow in a real browser (system Microsoft Edge, or EXECUTABLE=/path/to/chromium) against the demo/mock app:
 * ask in the chat, review and sign the drafted contract, buy, approve, pay, "Try an attack", an amendment diff, revoke and a refused approval. Takes desktop (1280) and mobile (380) screenshots into
 * docs/screenshots, checks for horizontal overflow at 380 px, checks that the stamp/pop/shake animations fire,
 * and that prefers-reduced-motion leaves no running animation. It also fails on any Content-Security-Policy violation (and proves the policy
 * is enforced by injecting an inline script that must be blocked), checks the category field keeps typed text with a hint, and checks the
 * streaming bubble (a stubbed event stream; no model key is used), the "free model quota is busy" card with its status line and its two
 * buttons (also stubbed), and the "Try it in 60 s" tour (ticks as the flow goes, collapsed strip on a phone, hides when all six are done).
 *
 * Mock payments, rules agent (LLM keys are blanked), fixture catalog: no keys, no paid calls.
 * Run: npm run build && npm run screenshots   (CHANNEL=chrome to use Chrome instead of Edge)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { chromium, type Page } from "playwright-core";

const OUT = "docs/screenshots";
// `phone` is the README profile: a real phone viewport at 2x, one viewport-sized shot per key step (see HERO), so every picture has the same size and sharp text.
// `mobile` (380 px, full page) stays the layout check.
const VIEWPORTS = [{ name: "desktop", width: 1280, height: 900, scale: 1 }, { name: "mobile", width: 380, height: 800, scale: 1 }, { name: "phone", width: 390, height: 900, scale: 2 }] as const;
const HERO = new Set(["1-chat-draft", "2-draft-form", "6-attack", "10-refused"]);

const freePort = () => new Promise<number>((res, rej) => {
  const s = createServer();
  s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); });
  s.on("error", rej);
});

function startApp(port: number): ChildProcess {
  const blank = { GOOGLE_GENERATIVE_AI_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", CHANNEL3_API_KEY: "", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "" };
  return spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: { ...process.env, ...blank, DEMO_MODE: "mock", CURRENCY: "EUR", PORT: String(port) }, stdio: ["ignore", "pipe", "inherit"],
  });
}

async function waitUp(url: string) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${url}/api/config`)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("app did not start");
}

type Finding = { run: string; step: string; what: string };
const findings: Finding[] = [];
const log = (s: string) => console.log(s);

async function run(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string, vp: (typeof VIEWPORTS)[number], reduced: boolean) {
  const tag = `${vp.name}${reduced ? "+reduced-motion" : ""}`;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: vp.scale, hasTouch: vp.width < 700, isMobile: vp.width < 700 });
  await ctx.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const anims = (p: Page) => p.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName || a.constructor.name));
  const shot = async (name: string) => {
    if (reduced) return;
    if (vp.name !== "phone") { await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png`, fullPage: true }); return; }
    if (!HERO.has(name)) return;
    // Collapse the tour for the picture (it would take a third of a phone screen), then put it back.
    const toggle = page.locator(".tour-toggle");
    const wasOpen = (await toggle.count()) > 0 && (await toggle.getAttribute("aria-expanded")) === "true";
    if (wasOpen) await toggle.click();
    // The attack card is tall: start it at the top of the chat pane so its first lines are not cut.
    if (name === "6-attack") await page.locator(".verdict.bad").first().evaluate((el) => el.closest("div")?.parentElement?.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png` });
    if (wasOpen) await toggle.click();
  };
  /** Checks run on every step once it has settled. */
  const check = async (step: string) => {
    await page.waitForTimeout(450);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    const csp = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    if (csp.length) { log(`  [${tag}] ${step}: CSP VIOLATION ${csp.join(" | ")}`); findings.push({ run: tag, step, what: `Content-Security-Policy violation: ${csp.join(" | ")}` }); await page.evaluate(() => ((window as unknown as { __csp: string[] }).__csp = [])); }
    const over = o.sw > o.iw;
    log(`  [${tag}] ${step}: scrollWidth ${o.sw} / innerWidth ${o.iw}${over ? "  OVERFLOW" : ""}`);
    if (over) findings.push({ run: tag, step, what: `horizontal overflow ${o.sw} > ${o.iw}` });
    if (reduced) {
      const a = await anims(page);
      log(`  [${tag}] ${step}: running animations ${a.length}${a.length ? " " + a.join(",") : ""}`);
      if (a.length) findings.push({ run: tag, step, what: `animations under reduced motion: ${a.join(",")}` });
    }
  };
  /** On a touch screen every visible control is at least 44 x 44 px. Tag remove buttons (the small x inside a tag) are the one known exception: a bigger target would overlap the next tag. */
  const tapTargets = async (step: string) => {
    if (vp.width >= 700) return;
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("button, a[href], [role=tab], summary")]
        .map((el) => ({ el, r: el.getBoundingClientRect(), hidden: getComputedStyle(el).visibility === "hidden" || Boolean(el.closest(".sr-only")) || Boolean(el.closest(".tag")) }))
        .filter((x) => x.r.width > 0 && x.r.height > 0 && !x.hidden && (x.r.width < 44 || x.r.height < 44))
        .map((x) => ({ what: `${x.el.tagName.toLowerCase()}.${x.el.className || ""} "${(x.el.textContent ?? "").trim().slice(0, 24)}"`, w: Math.round(x.r.width), h: Math.round(x.r.height) })));
    await must(step, small.length === 0, `touch targets are at least 44 x 44${small.length ? ` (too small: ${small.map((x) => `${x.what} ${x.w}x${x.h}`).join("; ")})` : ""}`);
  };
  const fires = async (step: string, name: string, selector: string) => {
    const a = await page.evaluate((sel) => document.querySelector(sel)?.getAnimations({ subtree: true }).map((x) => (x as CSSAnimation).animationName) ?? [], selector);
    const ok = a.includes(name);
    log(`  [${tag}] ${step}: ${name} animation ${ok ? "running" : "not running"} (${a.join(",") || "none"})`);
    if (!reduced && !ok) findings.push({ run: tag, step, what: `${name} did not fire` });
    if (reduced && ok) findings.push({ run: tag, step, what: `${name} fired under reduced motion` });
  };
  const must = async (step: string, ok: boolean, what: string) => { log(`  [${tag}] ${step}: ${what} ${ok ? "ok" : "FAILED"}`); if (!ok) findings.push({ run: tag, step, what }); };
  /** On a phone the two panes are tabs: open the one that holds what the step needs. */
  const tab = async (name: "Chat" | "Contracts") => { const t = page.getByRole("tab", { name: new RegExp(`^${name}`) }); if (await t.isVisible()) await t.click(); };
  const say = async (text: string) => {
    await tab("Chat");
    const before = await page.locator(".msg.agent").count();
    await page.locator("#chat-input").fill(text);
    await page.locator("#chat-input").press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll(".msg.agent").length > n, before, { timeout: 15000 });
  };

  const first = await page.goto(url);
  await page.getByText("Tell the agent what to buy.").waitFor();
  await check("0 empty chat");
  await shot("0-chat");
  // The tour: visible on a first visit with nothing done; open on desktop, a collapsed strip on a phone.
  await must("0 tour", (await page.locator(".tour").count()) === 1 && /0 of 6 done/.test((await page.locator(".tour-toggle").textContent()) ?? ""), "the 60-second tour is shown with 0 of 6 done");
  await must("0 tour collapse", (await page.locator(".tour-toggle").getAttribute("aria-expanded")) === (vp.width < 700 ? "false" : "true"), "the tour is open on desktop and a collapsed strip on a phone");

  // The policy is sent, and it is enforced: an injected inline script must be blocked (that one expected violation is not a finding).
  const header = first?.headers()["content-security-policy"] ?? "";
  await must("0 csp header", /default-src 'self'/.test(header) && /script-src 'self'(;|$)/.test(header) && !/unsafe-eval|script-src[^;]*unsafe-inline/.test(header), "Content-Security-Policy is sent, scripts limited to 'self', no unsafe-eval");
  const before = errors.length;
  const ran = await page.evaluate(() => {
    const el = document.createElement("script");
    el.textContent = "window.__pwned = 1";
    document.body.append(el);
    return new Promise<{ pwned: boolean; csp: string[] }>((r) => setTimeout(() => r({ pwned: Boolean((window as unknown as { __pwned?: number }).__pwned), csp: (window as unknown as { __csp: string[] }).__csp.slice() }), 300));
  });
  await must("0 csp enforced", !ran.pwned && ran.csp.some((c) => c.startsWith("script-src")), "an injected inline script is blocked and reported");
  await page.evaluate(() => ((window as unknown as { __csp: string[] }).__csp = []));
  errors.splice(before); // the console line for the blocked script is expected

  // 1. Ask in plain words: the agent drafts a contract. Nothing is signed.
  await page.getByRole("button", { name: "Indoor futsal shoes, max 90 €" }).click();
  await page.getByRole("group", { name: "draft card" }).waitFor();
  await must("1 draft", (await page.locator(".statuschip.active").count()) === 0, "no active contract before a person signs");
  await check("1 chat with draft card");
  await tapTargets("1 chat");
  await shot("1-chat-draft");
  await tab("Contracts");
  await page.getByRole("button", { name: "Sign contract" }).waitFor();
  await must("1 draft form", (await page.getByText("from the agent").count()) > 0, "fields filled by the agent are marked");
  await check("1 draft form");
  await tapTargets("1 contracts");
  await shot("2-draft-form");
  // Undo toast: discarding a draft hides it at once and offers Undo; Undo brings the very same draft back. (The request is only sent after 8 s.)
  await page.getByRole("button", { name: "Discard" }).click();
  await must("1 undo toast", (await page.getByRole("status").filter({ hasText: "Draft discarded" }).count()) === 1 && (await page.getByRole("button", { name: "Sign contract" }).count()) === 0, "discarding a draft shows an Undo toast (role=status) and hides the draft");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Sign contract" }).waitFor();
  await must("1 undo restores", (await page.getByRole("status").filter({ hasText: "Draft discarded" }).count()) === 0, "Undo brings the draft back and the toast goes");

  // Ticket 12: text typed in the category field and not confirmed with Enter is kept on blur, with a visible hint.
  const cats = page.getByLabel(/^Categories/);
  await cats.fill("grip socks");
  await page.getByRole("heading", { name: /contract/i }).first().click().catch(() => page.locator("legend").first().click());
  await page.waitForTimeout(150);
  await must("1 category hint", (await cats.inputValue()) === "grip socks" && (await page.getByText(/"grip socks" is not added yet/).isVisible()), "a typed category stays on blur with a \"not added yet\" hint");
  await cats.fill("");

  // 2. Sign it (the person's button), then buy under it.
  await page.getByRole("button", { name: "Sign contract" }).click();
  // After signing, the agent carries on by itself (no second request to type): a small note, then a cart to approve. Only search and propose.
  // On a phone the app moves the person to the Chat tab, where the cart will appear.
  await page.locator(".sysline", { hasText: "Contract signed. Looking for what you asked" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /^Approve €/ }).waitFor({ timeout: 15000 });
  await must("3 after sign", (await page.locator(".sysline").count()) === 1 && (await page.getByRole("button", { name: /^Approve €/ }).count()) === 1, "signing is followed by one note and one cart to approve, with no second request typed");
  if (await page.locator(".tour-toggle").getAttribute("aria-expanded") === "false") await page.locator(".tour-toggle").click();
  await must("3 tour hint", (await page.locator(".tour-steps li.next small", { hasText: "Approve the cart above." }).count()) === 1, "the tour's next step points at the cart above");
  await check("3 proposal in chat");
  await shot("4-proposal");
  await tab("Contracts");
  await page.locator(".statuschip.active").first().waitFor();
  await check("2 signed");
  await shot("3-signed");
  await tab("Chat");
  await page.getByRole("button", { name: /^Approve €/ }).click();
  await page.getByRole("button", { name: "Pay (simulate buyer)" }).click();
  await page.locator(".receipt").waitFor();
  await fires("3 paid", "pop", ".receipt");
  await check("3 paid");
  await shot("5-paid");
  if (await page.locator(".tour-toggle").getAttribute("aria-expanded") === "false") await page.locator(".tour-toggle").click();
  await must("3 tour ticks", /3 of 6 done/.test((await page.locator(".tour-toggle").textContent()) ?? "") && (await page.locator(".tour-steps li.done").count()) === 3, "ask, sign and buy are ticked from the server's state");
  await shot("5b-tour");

  // 3. The attack: the fooled model proposes 10, plain code says no.
  await tab("Chat");
  await page.getByRole("button", { name: "Try an attack" }).click();
  await page.locator(".verdict.bad").first().waitFor();
  await fires("4 attack blocked", "shake", ".verdict.bad");
  await check("4 attack");
  await shot("6-attack");

  // 4. An amendment: the agent proposes, the diff shows before/after, the person signs. Spend carries over.
  await say("raise the budget to 200 €");
  await page.getByRole("group", { name: "amendment card" }).waitFor();
  await tab("Contracts");
  await page.getByRole("button", { name: "Sign amendment" }).waitFor();
  await must("5 amendment", (await page.locator(".difftable .after").count()) > 0, "before/after diff shown");
  await check("5 amendment diff");
  await shot("7-amendment");
  await page.getByRole("button", { name: "Sign amendment" }).click();
  await page.locator(".statuschip.superseded").first().waitFor();
  await check("5 after amendment");
  await shot("8-after-amendment");

  // 5. A second cart waits for approval; the person revokes; approving it now is refused at checkout.
  await say("Indoor futsal shoes, size 43, non-marking sole, max 90 €");
  await page.getByRole("button", { name: /^Approve €/ }).waitFor();
  await tab("Contracts");
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("button", { name: "Confirm revoke" }).click();
  await page.locator(".statuschip.revoked").first().waitFor();
  await check("6 revoked");
  await shot("9-revoked");
  await tab("Chat");
  await page.getByRole("button", { name: /^Approve €/ }).click();
  await page.locator(".alert", { hasText: "Stopped at checkout" }).waitFor();
  await check("6 refused after revoke");
  await shot("10-refused");

  // The streaming bubble: a stubbed event stream (text pieces, a pause, then done). The pieces show as plain text, then the final reply replaces them.
  await tab("Chat");
  await page.evaluate(() => {
    const orig = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).endsWith("/api/chat/stream")) return orig(input, init);
      // No named helper functions in here: the page cannot see the transpiler's `__name`.
      const enc = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({
        async start(c) {
          c.enqueue(enc.encode('event: text\ndata: {"delta":"Looking "}\n\n'));
          await new Promise((r) => setTimeout(r, 200));
          c.enqueue(enc.encode('event: text\ndata: {"delta":"around <b>now</b>"}\n\n'));
          await new Promise((r) => setTimeout(r, 1500));
          c.enqueue(enc.encode('event: done\ndata: {"messages":[{"role":"assistant","text":"Stub final answer."}],"cards":[]}\n\n'));
          c.close();
        },
      }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    }) as typeof window.fetch;
  });
  await page.locator("#chat-input").fill("anything");
  await page.locator("#chat-input").press("Enter");
  const live = page.locator(".msg.agent.streaming .bubble");
  await live.waitFor({ timeout: 4000 });
  await page.waitForFunction(() => document.querySelector(".msg.agent.streaming .bubble")?.textContent === "Looking around <b>now</b>", undefined, { timeout: 4000 });
  await must("7 streaming bubble", (await live.textContent()) === "Looking around <b>now</b>" && (await page.locator(".msg.agent.streaming b").count()) === 0 && (await page.locator(".msg.agent.streaming").getAttribute("aria-live")) === "off", "streamed words show as plain text (no HTML), not announced piece by piece");
  await page.locator(".msg.agent .bubble", { hasText: "Stub final answer." }).waitFor({ timeout: 5000 });
  await must("7 streaming replaced", (await page.locator(".msg.agent.streaming").count()) === 0, "the final reply replaces the streaming bubble");
  await check("7 streaming");

  // The free model quota is busy (stubbed stream: a status line, then a typed llm_limited card). It must say it is a usage limit, not a bug,
  // and offer Try again and the offline agent. The second call (Try again) answers normally.
  await page.evaluate(() => {
    const orig = window.fetch.bind(window);
    let calls = 0;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).endsWith("/api/chat/stream")) return orig(input, init);
      calls++;
      const first = calls === 1;
      const day = calls === 3;
      const enc = new TextEncoder();
      return Promise.resolve(new Response(new ReadableStream({
        async start(c) {
          if (first || day) {
            c.enqueue(enc.encode('event: status\ndata: {"text":"The free model is busy, retrying in 3 s…"}\n\n'));
            await new Promise((r) => setTimeout(r, 1500));
            const msg = day
              ? "Today's free model quota is used up; it resets in about 2 h. This is a usage limit of the Groq free tier, not a bug. Nothing was proposed or spent. You can continue with the offline agent."
              : "The demo's free model quota (Groq free tier) is busy right now. This is a usage limit, not a bug. Nothing was proposed or spent. Try again in about 20 s, or continue with the offline agent.";
            c.enqueue(enc.encode("event: done\ndata: " + JSON.stringify({ messages: [{ role: "assistant", text: msg }], cards: [{ type: "llm_limited", variant: day ? "day" : "minute", retryAfterSec: day ? 7200 : 20, message: msg }] }) + "\n\n"));
          } else {
            c.enqueue(enc.encode('event: done\ndata: {"messages":[{"role":"assistant","text":"Stub retry answer."}],"cards":[]}\n\n'));
          }
          c.close();
        },
      }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    }) as typeof window.fetch;
  });
  await page.locator("#chat-input").fill("something while the quota is busy");
  await page.locator("#chat-input").press("Enter");
  await page.locator(".working", { hasText: "busy, retrying in 3 s" }).waitFor({ timeout: 4000 });
  await must("8 status line", true, "the waiting line says why the turn waits (busy, retrying)");
  await page.locator(".limitcard").waitFor({ timeout: 5000 });
  const limitText = (await page.locator(".limitcard").textContent()) ?? "";
  await must("8 limit card", /usage limit of the free model, not a bug/.test(limitText) && /Nothing was proposed or spent/.test(limitText) && /Try again in about 20 s/.test(limitText), "the card itself says it is a usage limit, nothing was done, and how long to wait");
  await must("8 limit once", (await page.getByText(/usage limit/).count()) === 1 && (await page.locator(".msg.agent .bubble", { hasText: "usage limit" }).count()) === 0, "the message is shown once, in the card, not also as a bubble");
  await must("8 limit primary", (await page.locator(".limit-actions .primary", { hasText: "Try again" }).count()) === 1 && (await page.locator(".limit-actions .ghost", { hasText: "Use the offline agent" }).count()) === 1, "Try again is the primary button, the offline agent the secondary one");
  await page.locator(".limit-actions .primary").focus();
  await must("8 limit focus", await page.locator(".limit-actions .primary").evaluate((e) => { const cs = getComputedStyle(e); return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none"; }), "the primary button shows a visible focus ring");
  await must("8 limit buttons", (await page.getByRole("button", { name: "Try again" }).count()) === 1 && (await page.getByRole("button", { name: "Use the offline agent for this session" }).count()) === 1, "Try again and Use the offline agent are offered");
  await check("8 limit card");
  await shot("11-limit");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator(".msg.agent .bubble", { hasText: "Stub retry answer." }).waitFor({ timeout: 5000 });
  await must("8 try again", true, "Try again sends the last message once more");

  // Ask, sign, buy, attack, amend and revoke are all done by now: the tour has nothing left to say and hides itself.
  await must("8 tour done", (await page.locator(".tour").count()) === 0, "the tour is gone once all six steps are done");

  // The day variant (third stubbed call): the wait is in hours.
  await page.locator("#chat-input").fill("and now the daily quota is used up");
  await page.locator("#chat-input").press("Enter");
  await page.locator(".limitcard").nth(1).waitFor({ timeout: 6000 });
  const dayText = (await page.locator(".limitcard").nth(1).textContent()) ?? "";
  await must("8 limit day", /Today's free model quota is used up/.test(dayText) && /It resets in about 2 h/.test(dayText), "the day variant says the quota is used up and when it resets");
  await check("8 limit day");
  await shot("12-limit-day");

  if (errors.length) { log(`  [${tag}] console/page errors: ${errors.join(" | ")}`); findings.push({ run: tag, step: "all", what: `console errors: ${errors.join(" | ")}` }); }
  await ctx.close();
}

/** The first visit to a sleeping free-tier server, and a server that is down: the page must say so, and Try again must work. */
async function bootStates(browser: Awaited<ReturnType<typeof chromium.launch>>, url: string) {
  log("boot states (380px)");
  const ctx = await browser.newContext({ viewport: { width: 380, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route("**/api/config", async (route) => { await new Promise((r) => setTimeout(r, 3500)); await route.continue(); });
  await page.goto(url);
  const waking = await page.getByText(/Waking up the demo/).waitFor({ timeout: 3000 }).then(() => true, () => false);
  log(`  waking-up message while the server is slow: ${waking ? "shown" : "MISSING"}`);
  if (!waking) findings.push({ run: "boot", step: "slow server", what: "no waking-up message while /api/config is slow" });
  else await page.screenshot({ path: `${OUT}/mobile-cold-start.png` });
  await page.getByText("Tell the agent what to buy.").waitFor();
  const tabs = await page.getByRole("tab").count();
  log(`  tabs with an accessible name at 380px: ${tabs} of 2`);
  if (tabs !== 2) findings.push({ run: "boot", step: "tabs", what: `only ${tabs} of 2 tabs at phone width` });
  await ctx.close();

  const down = await browser.newContext({ viewport: { width: 380, height: 800 }, deviceScaleFactor: 1 });
  const p2 = await down.newPage();
  let calls = 0;
  await p2.route("**/api/config", (route) => (calls++ === 0 ? route.fulfill({ status: 502, body: "<html>Bad Gateway</html>", contentType: "text/html" }) : route.continue()));
  await p2.goto(url);
  const retry = p2.getByRole("button", { name: "Try again" });
  const shown = await retry.waitFor({ timeout: 4000 }).then(() => true, () => false);
  log(`  server down: Try again ${shown ? "shown" : "MISSING"}`);
  if (!shown) findings.push({ run: "boot", step: "server down", what: "no Try again button after a 502" });
  else {
    await p2.screenshot({ path: `${OUT}/mobile-server-down.png` });
    await retry.click();
    const back = await p2.getByText("Tell the agent what to buy.").waitFor({ timeout: 5000 }).then(() => true, () => false);
    log(`  Try again recovers the page: ${back}`);
    if (!back) findings.push({ run: "boot", step: "retry", what: "Try again did not load the page" });
  }
  await down.close();
}

async function main() {
  if (!existsSync("web/dist")) throw new Error("web/dist is missing: run `npm run build` first");
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const app = startApp(port);
  const browser = await chromium.launch({ ...(process.env.EXECUTABLE ? { executablePath: process.env.EXECUTABLE } : { channel: process.env.CHANNEL ?? "msedge" }), args: process.env.NO_SANDBOX ? ["--no-sandbox"] : [] }); // NO_SANDBOX=1 when running as root (CI containers)
  try {
    await waitUp(url);
    await bootStates(browser, url);
    for (const vp of VIEWPORTS) for (const reduced of vp.name === "phone" ? [false] : [false, true]) { log(`${vp.name} ${vp.width}px, reduced motion: ${reduced}`); await run(browser, url, vp, reduced); }
  } finally {
    await browser.close();
    app.kill();
  }
  log(findings.length ? `\n${findings.length} finding(s):\n${findings.map((f) => `- [${f.run}] ${f.step}: ${f.what}`).join("\n")}` : "\nAll checks passed.");
  process.exitCode = findings.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
