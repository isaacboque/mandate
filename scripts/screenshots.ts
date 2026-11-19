/**
 * Drives the whole web flow in a real browser (system Microsoft Edge, or EXECUTABLE=/path/to/chromium) against the demo/mock app:
 * ask in the chat, review and sign the drafted contract, buy, approve, pay, "Try an attack", an amendment diff, revoke and a refused approval. Takes desktop (1280) and mobile (380) screenshots into
 * docs/screenshots, checks for horizontal overflow at 380 px, checks that the stamp/pop/shake animations fire,
 * and that prefers-reduced-motion leaves no running animation.
 *
 * Mock payments, rules agent (LLM keys are blanked), fixture catalog: no keys, no paid calls.
 * Run: npm run build && npm run screenshots   (CHANNEL=chrome to use Chrome instead of Edge)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { chromium, type Page } from "playwright-core";

const OUT = "docs/screenshots";
const VIEWPORTS = [{ name: "desktop", width: 1280, height: 900 }, { name: "mobile", width: 380, height: 800 }] as const;

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
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const anims = (p: Page) => p.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName || a.constructor.name));
  const shot = async (name: string) => { if (!reduced) await page.screenshot({ path: `${OUT}/${vp.name}-${name}.png`, fullPage: true }); };
  /** Checks run on every step once it has settled. */
  const check = async (step: string) => {
    await page.waitForTimeout(450);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    const over = o.sw > o.iw;
    log(`  [${tag}] ${step}: scrollWidth ${o.sw} / innerWidth ${o.iw}${over ? "  OVERFLOW" : ""}`);
    if (over) findings.push({ run: tag, step, what: `horizontal overflow ${o.sw} > ${o.iw}` });
    if (reduced) {
      const a = await anims(page);
      log(`  [${tag}] ${step}: running animations ${a.length}${a.length ? " " + a.join(",") : ""}`);
      if (a.length) findings.push({ run: tag, step, what: `animations under reduced motion: ${a.join(",")}` });
    }
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

  await page.goto(url);
  await page.getByText("Tell the agent what to buy.").waitFor();
  await check("0 empty chat");
  await shot("0-chat");

  // 1. Ask in plain words: the agent drafts a contract. Nothing is signed.
  await page.getByRole("button", { name: "Indoor futsal shoes, max 90 €" }).click();
  await page.getByRole("group", { name: "draft card" }).waitFor();
  await must("1 draft", (await page.locator(".statuschip.active").count()) === 0, "no active contract before a person signs");
  await check("1 chat with draft card");
  await shot("1-chat-draft");
  await tab("Contracts");
  await page.getByRole("button", { name: "Sign contract" }).waitFor();
  await must("1 draft form", (await page.getByText("from the agent").count()) > 0, "fields filled by the agent are marked");
  await check("1 draft form");
  await shot("2-draft-form");

  // 2. Sign it (the person's button), then buy under it.
  await page.getByRole("button", { name: "Sign contract" }).click();
  await page.locator(".statuschip.active").first().waitFor();
  await check("2 signed");
  await shot("3-signed");
  await say("Indoor futsal shoes, size 43, non-marking sole, max 90 €");
  await page.getByRole("button", { name: /^Approve €/ }).waitFor();
  await check("3 proposal in chat");
  await shot("4-proposal");
  await page.getByRole("button", { name: /^Approve €/ }).click();
  await page.getByRole("button", { name: "Pay (simulate buyer)" }).click();
  await page.locator(".receipt").waitFor();
  await fires("3 paid", "pop", ".receipt");
  await check("3 paid");
  await shot("5-paid");

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
    for (const vp of VIEWPORTS) for (const reduced of [false, true]) { log(`${vp.name} ${vp.width}px, reduced motion: ${reduced}`); await run(browser, url, vp, reduced); }
  } finally {
    await browser.close();
    app.kill();
  }
  log(findings.length ? `\n${findings.length} finding(s):\n${findings.map((f) => `- [${f.run}] ${f.step}: ${f.what}`).join("\n")}` : "\nAll checks passed.");
  process.exitCode = findings.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
