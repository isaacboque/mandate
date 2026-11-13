/**
 * Drives the whole web flow in a real browser (system Microsoft Edge, no download) against the demo/mock app:
 * sign a mandate, ask, approve, pay, plus "Try an attack". Takes desktop (1280) and mobile (380) screenshots into
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
  const shotEl = async (sel: string, name: string) => { if (!reduced) { await page.waitForTimeout(450); await page.locator(sel).first().screenshot({ path: `${OUT}/${vp.name}-${name}.png` }); } };
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
  /** Right after the action, the named flourish must be running (normal motion), and absent under reduced motion. */
  const fires = async (step: string, name: string, selector: string) => {
    const a = await page.evaluate((sel) => document.querySelector(sel)?.getAnimations({ subtree: true }).map((x) => (x as CSSAnimation).animationName) ?? [], selector);
    const ok = a.includes(name);
    log(`  [${tag}] ${step}: ${name} animation ${ok ? "running" : "not running"} (${a.join(",") || "none"})`);
    if (!reduced && !ok) findings.push({ run: tag, step, what: `${name} did not fire` });
    if (reduced && ok) findings.push({ run: tag, step, what: `${name} fired under reduced motion` });
  };

  await page.goto(url);
  await page.getByRole("heading", { name: "What should it buy?" }).waitFor();
  await check("0 form");
  await shot("0-form");

  // Draft from a sentence, review the form (existing name: 1-mandate), then sign only so the stamp shows on the Ask step.
  await page.locator("#describe").fill("Indoor futsal shoes, size 43, non-marking sole, max 90 €");
  await page.getByRole("button", { name: "Draft the limits" }).click();
  await page.getByText("Here is what I understood").waitFor();
  await page.waitForTimeout(500);
  await check("0 drafted form");
  await shot("1-mandate");

  const signAnim = page.getByRole("button", { name: "Sign only" }).click();
  await signAnim;
  await page.locator(".seal.stamp, .seal").first().waitFor();
  await fires("1 ask (just signed)", "stamp", ".seal");
  await shotEl(".seal", "1-seal-stamp");
  await check("1 ask");
  await shot("1-ask");

  await page.getByRole("button", { name: "Find options" }).click();
  await page.getByRole("heading", { name: "Proposals" }).waitFor();
  await check("2 proposal");
  await shot("2-proposal");

  await page.getByRole("button", { name: /^Review / }).first().click();
  await page.getByRole("heading", { name: "Approve this purchase?" }).waitFor();
  await check("3 approve");
  await shot("3-approve");

  await page.getByRole("button", { name: /^Approve / }).click();
  await page.getByRole("button", { name: "Simulate buyer and pay" }).waitFor();
  await check("3 order created");
  await page.getByRole("button", { name: "Simulate buyer and pay" }).click();
  await page.locator(".receipt").waitFor();
  await fires("3 paid", "pop", ".receipt");
  await shotEl(".receipt", "4-receipt");
  await check("3 paid");
  await shot("4-paid");

  await page.getByRole("button", { name: "Buy something else" }).click();
  await page.getByRole("button", { name: "Try an attack" }).waitFor();
  await page.getByRole("button", { name: "Try an attack" }).click();
  await page.locator(".verdict.bad").first().waitFor();
  await fires("2 attack blocked", "shake", ".verdict.bad");
  await shotEl(".pcard.blocked", "5-blocked");
  await check("2 attack");
  await shot("5-attack");

  if (errors.length) { log(`  [${tag}] console/page errors: ${errors.join(" | ")}`); findings.push({ run: tag, step: "all", what: `console errors: ${errors.join(" | ")}` }); }
  await ctx.close();
}

async function main() {
  if (!existsSync("web/dist")) throw new Error("web/dist is missing: run `npm run build` first");
  mkdirSync(OUT, { recursive: true });
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const app = startApp(port);
  const browser = await chromium.launch({ channel: process.env.CHANNEL ?? "msedge" });
  try {
    await waitUp(url);
    for (const vp of VIEWPORTS) for (const reduced of [false, true]) { log(`${vp.name} ${vp.width}px, reduced motion: ${reduced}`); await run(browser, url, vp, reduced); }
  } finally {
    await browser.close();
    app.kill();
  }
  log(findings.length ? `\n${findings.length} finding(s):\n${findings.map((f) => `- [${f.run}] ${f.step}: ${f.what}`).join("\n")}` : "\nAll checks passed.");
  process.exitCode = findings.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
