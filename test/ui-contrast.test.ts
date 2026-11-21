import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = (f: string) => readFileSync(new URL(`../web/src/${f}`, import.meta.url), "utf8");
const styles = css("styles.css");
/** A token's colour as #rrggbb (the file also writes #fff). */
const token = (name: string) => {
  const hex = new RegExp(`--${name}:\\s*#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b`).exec(styles)?.[1];
  if (!hex) throw new Error(`token --${name} not found`);
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
};

/** WCAG 2.x relative luminance and contrast ratio. */
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("UI contrast (WCAG AA 1.4.3): every text colour the design uses, on the surfaces it is used on", () => {
  // [text token, surface token, where it is used]
  const pairs: [string, string, string][] = [
    ["ink", "card", "body text on a card"], ["ink", "paper", "body text on a quiet surface"], ["ink", "bg", "text on the page"],
    ["muted", "card", "secondary text on a card"], ["muted", "paper", "secondary text on a quiet surface (past contracts, chips)"], ["muted", "bg", "secondary text on the page"],
    ["brand", "brand-soft", "badge"], ["brand", "card", "link"], ["brand-ink", "brand", "primary button"],
    ["good", "good-soft", "approved, paid, active"], ["warn", "warn-soft", "limit card, draft"], ["bad", "bad-soft", "blocked, revoked"],
  ];
  for (const [fg, bg, where] of pairs) {
    it(`${fg} on ${bg} (${where}) is at least 4.5:1`, () => {
      expect(ratio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("a past contract (revoked, superseded, expired) is not dimmed with opacity on the whole card: that dropped its text to 3.2-4.4:1", () => {
    const agent = css("agent.css");
    const rules = [...agent.matchAll(/([^{}]*\.contract\.(?:revoked|superseded|expired)[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      // only the meter (a graphic, not text) may be dimmed
      if (/\.meter\b/.test(selector)) continue;
      expect(body, selector).not.toMatch(/\bopacity\s*:/);
    }
  });
});
