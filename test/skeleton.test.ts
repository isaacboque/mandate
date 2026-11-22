import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bootPhase } from "../web/src/Booting";
import { WorkspaceSkeleton } from "../web/src/Skeleton";

describe("skeleton loaders (1)", () => {
  it("nothing for the first 300 ms, so a fast server never flashes a placeholder; then the skeleton; the 'waking up' message after 2 s", () => {
    expect(bootPhase(0, false)).toBe("quiet");
    expect(bootPhase(299, false)).toBe("quiet");
    expect(bootPhase(300, false)).toBe("skeleton");
    expect(bootPhase(1999, false)).toBe("skeleton");
    expect(bootPhase(2000, false)).toBe("waking");
  });
  it("an error replaces everything", () => {
    expect(bootPhase(0, true)).toBe("error");
    expect(bootPhase(5000, true)).toBe("error");
  });
  it("the skeleton is built on the same layout as the loaded workspace, so nothing jumps when the content arrives", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceSkeleton));
    for (const cls of ["workspace", "pane chatpane", "pane contractspane", "tabs", "panehead", "chat", "card"]) expect(html, cls).toContain(`class="${cls}`.replace(/"$/, "")) ;
    expect(html).toContain('aria-hidden="true"');
  });
  it("the shimmer stops under reduced motion", () => {
    const css = readFileSync(new URL("../web/src/details.css", import.meta.url), "utf8");
    expect(css).toMatch(/@keyframes shimmer/);
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(css).toMatch(/\.sk\s*\{[^}]*animation:\s*shimmer/);
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.sk[^}]*animation:\s*none/)).not.toBeNull();
    expect(reduced.length).toBeGreaterThan(0);
  });
});
