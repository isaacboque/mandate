import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";

// Opens site/index.html locally with a stubbed health endpoint and saves the three states (waking, ready, asleep) on desktop and at 380 px.
//   EXECUTABLE=/path/to/chrome NO_SANDBOX=1 npm run landing:screenshots
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".mp4": "video/mp4", ".webm": "video/webm", ".gif": "image/gif" };
const server = createServer((req, res) => {
  const f = join("site", req.url === "/" || !req.url ? "index.html" : req.url.split("?")[0]);
  if (!existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" });
  createReadStream(f).pipe(res);
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://localhost:${(server.address() as { port: number }).port}/`;
mkdirSync("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.EXECUTABLE, args: process.env.NO_SANDBOX ? ["--no-sandbox"] : [] });
const HEALTH = "https://mandate-gb6t.onrender.com/api/health";
const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };
for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 380, height: 900 }]] as const) {
  for (const state of ["waking", "ready", "asleep"] as const) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.route(HEALTH, (route) => (state === "ready" ? route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ ok: true }) }) : route.abort()));
    if (state === "asleep") await page.clock.install();
    await page.goto(base);
    if (state === "asleep") await page.clock.fastForward(95_000);
    else if (state === "waking") await page.waitForTimeout(500);
    await page.waitForFunction((s) => document.getElementById("pill")?.getAttribute("data-phase") === s, state);
    await page.screenshot({ path: `docs/screenshots/landing-${name}-${state}.png`, fullPage: true });
    console.log(`${name} ${state}: ${await page.locator("#pill-text").innerText()}`);
    await ctx.close();
  }
}
await browser.close();
server.close();
