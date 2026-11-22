import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const details = read("web/src/details.css");
const rule = (css: string, selector: RegExp) => css.split("}").map((b) => b.trim()).filter((b) => selector.test(b.split("{")[0] ?? "")).join("}\n");

describe("typography: balanced headlines (17)", () => {
  it("headings and short titles balance, paragraphs avoid orphans, in the app and on the landing page", () => {
    expect(rule(details, /\bh1\b/)).toMatch(/text-wrap:\s*balance/);
    expect(rule(details, /\bh2\b/)).toMatch(/text-wrap:\s*balance/);
    expect(rule(details, /\bp\b/)).toMatch(/text-wrap:\s*pretty/);
    const site = read("site/index.html");
    expect(site).toMatch(/h1[^{}]*\{[^}]*text-wrap:\s*balance/);
    expect(site).toMatch(/text-wrap:\s*pretty/);
  });
});

describe("typography: tabular numbers (16)", () => {
  it("every place a number changes or lines up uses tabular figures", () => {
    const selectors = [".amt", ".bigamt", ".meterlegend b", ".cterms dd", ".working b", ".boot b", ".tour-count", "time"];
    const block = rule(details, /tabular|\.amt/);
    for (const s of selectors) expect(block, s).toContain(s);
    expect(block).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe("layout: safe-area insets (14)", () => {
  it("the page extends under the notch and keeps controls clear of it, in the app and on the landing page", () => {
    expect(read("web/index.html")).toMatch(/viewport-fit=cover/);
    for (const side of ["top", "right", "bottom", "left"]) expect(details).toContain(`env(safe-area-inset-${side}`);
    const site = read("site/index.html");
    expect(site).toMatch(/viewport-fit=cover/);
    expect(site).toContain("env(safe-area-inset-bottom");
  });
});

describe("shape: continuous corners (18)", () => {
  it("squircle corners are an enhancement next to the existing border-radius, only where the browser supports them", () => {
    expect(details).toMatch(/@supports\s*\(corner-shape:\s*squircle\)/);
    const supported = details.slice(details.indexOf("@supports (corner-shape"));
    expect(supported).toMatch(/corner-shape:\s*squircle/);
    expect(supported).toContain(".card");
    expect(supported).toContain(".primary");
    expect(details.replace(supported, "")).not.toMatch(/corner-shape/);
  });
});

describe("touch targets (13)", () => {
  it("on a coarse pointer every control is at least 44 by 44 px, replacing the old 36 px minimum", () => {
    const coarse = details.slice(details.indexOf("@media (pointer: coarse)"));
    expect(coarse).toMatch(/min-height:\s*44px/);
    expect(coarse).toMatch(/min-width:\s*44px/);
    for (const s of [".chip", ".ghost.small", ".linklike", ".tabs button", "summary"]) expect(coarse, s).toContain(s);
    expect(read("web/src/mandate.css")).not.toMatch(/\.chip, \.ghost\.small \{ min-height: 36px; \}/);
  });
});
