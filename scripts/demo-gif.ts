/**
 * Records the attack-blocked flow (ask, sign the draft, "Try an attack", read the block reason) in a real browser against a local
 * demo/mock app: it takes screenshots in a loop (Playwright's own video recorder needs a separate ffmpeg build) and assembles docs/demo.gif with the system ffmpeg. No keys, no paid calls (LLM keys are blanked, mock payments).
 * Run: npm run build && npm run demo:gif   (EXECUTABLE=/path/to/chrome-or-chromium to choose the browser; SYSTEM_CHROME=1 uses /usr/bin/google-chrome)
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const OUT = "docs/demo.gif";
const freePort = () => new Promise<number>((res, rej) => {
  const s = createServer();
  s.listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); });
  s.on("error", rej);
});
function startApp(port: number): ChildProcess {
  const blank = { GOOGLE_GENERATIVE_AI_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", CHANNEL3_API_KEY: "", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "" };
  return spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { env: { ...process.env, ...blank, DEMO_MODE: "mock", CURRENCY: "EUR", PORT: String(port) }, stdio: ["ignore", "pipe", "inherit"] });
}
async function waitUp(url: string) {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${url}/api/config`)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("app did not start");
}

async function main() {
  if (!existsSync("web/dist")) throw new Error("web/dist is missing: run `npm run build` first");
  // EXECUTABLE=/path/to/chrome picks a browser; otherwise Playwright's own Chromium, then the system Chrome.
  const exe = process.env.EXECUTABLE ?? (process.env.SYSTEM_CHROME && existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);
  const tmp = mkdtempSync(join(tmpdir(), "mandate-demo-"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const app = startApp(port);
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: process.env.NO_SANDBOX ? ["--no-sandbox"] : [] });
  try {
    await waitUp(url);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    // External fonts are not needed for the demo, and a screenshot waits for them: fail them fast so a restricted network cannot stall the recording.
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const page = await ctx.newPage();
    const beat = (ms = 900) => page.waitForTimeout(ms);
    await page.goto(url);
    await page.getByText("Tell the agent what to buy.").waitFor();
    // Frame grabber: screenshots as fast as the browser allows; the real frame rate is measured, so playback speed matches real time.
    let grabbing = true, n = 0;
    const started = Date.now();
    const grabber = (async () => {
      while (grabbing) { await page.screenshot({ path: join(tmp, `f${String(n++).padStart(5, "0")}.jpg`), type: "jpeg", quality: 80 }); }
    })();
    await beat(2000);
    await page.getByRole("button", { name: "Indoor futsal shoes, max 90 €" }).click();
    await page.getByRole("group", { name: "draft card" }).waitFor();
    await beat(3500); // read the drafted contract
    await page.getByRole("button", { name: "Sign contract" }).click(); // the person's button
    await page.locator(".statuschip.active").first().waitFor();
    await beat(2500);
    await page.getByRole("button", { name: "Try an attack" }).click(); // a fooled model proposes what the listing says
    await page.locator(".verdict.bad").first().waitFor();
    await beat(8000); // time to read the block reason
    grabbing = false;
    await grabber;
    const seconds = (Date.now() - started) / 1000;
    const fps = Math.max(1, n / seconds);
    console.log(`${n} frames in ${seconds.toFixed(1)} s (${fps.toFixed(1)} fps)`);
    await ctx.close();
    mkdirSync("docs", { recursive: true });
    const palette = join(tmp, "palette.png");
    const vf = "fps=10,scale=800:-1:flags=lanczos"; // input rate is the measured capture rate, so playback is real time
    const input = ["-framerate", String(fps), "-i", join(tmp, "f%05d.jpg")];
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...input, "-vf", `${vf},palettegen=max_colors=96`, palette]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...input, "-i", palette, "-lavfi", `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4`, OUT]);
    const mb = statSync(OUT).size / 1024 / 1024;
    console.log(`${OUT}: ${mb.toFixed(2)} MB`);
    if (mb > 5) throw new Error(`${OUT} is ${mb.toFixed(1)} MB, over the 5 MB limit`);
  } finally {
    await browser.close();
    app.kill();
    rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
