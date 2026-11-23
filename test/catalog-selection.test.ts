import { describe, expect, it } from "vitest";
import { configFromEnv } from "../src/server/app.js";
import { serviceFromEnv, catalogFromEnv } from "../src/server/deps.js";
import { checkEnv } from "../src/server/envcheck.js";
import { Channel3Catalog } from "../src/catalog/Channel3Catalog.js";
import { FixtureCatalog } from "../src/catalog/FixtureCatalog.js";

describe("which catalog the server searches (independent of the payments mode)", () => {
  it("default: fixtures in mock mode, Channel3 in live mode", () => {
    expect(configFromEnv({}).catalog).toBe("fixtures");
    expect(configFromEnv({ DEMO_MODE: "live", CHANNEL3_API_KEY: "k" }).catalog).toBe("channel3");
  });

  it("mock payments can search the real catalog: CATALOG=channel3 with a key", () => {
    const env = { CATALOG: "channel3", CHANNEL3_API_KEY: "k" };
    const config = configFromEnv(env);
    expect(config.demoMode).toBe("mock");
    expect(config.catalog).toBe("channel3");
    expect(catalogFromEnv(env, config)).toBeInstanceOf(Channel3Catalog);
  });

  it("CATALOG=channel3 without a key falls back to fixtures, and says so", () => {
    for (const key of [undefined, "", "  "]) {
      const env = { CATALOG: "channel3", CHANNEL3_API_KEY: key };
      const config = configFromEnv(env);
      expect(config.catalog).toBe("fixtures");
      expect(catalogFromEnv(env, config)).toBeInstanceOf(FixtureCatalog);
      const doctor = checkEnv(env);
      expect(doctor.lines.join("\n")).toMatch(/CATALOG=channel3.*CHANNEL3_API_KEY.*fixture/is);
    }
  });

  it("no CATALOG variable and a key in mock mode: still fixtures (the choice is explicit)", () => {
    expect(configFromEnv({ CHANNEL3_API_KEY: "k" }).catalog).toBe("fixtures");
  });

  it("the category-search limit is on whenever Channel3 is the catalog, not only in live mode", () => {
    expect(serviceFromEnv({ CATALOG: "channel3", CHANNEL3_API_KEY: "k" }).categoryLimiter.enabled).toBe(true);
    expect(serviceFromEnv({}).categoryLimiter.enabled).toBe(false);
  });

  it("the doctor describes the catalog and never prints the key", () => {
    const text = checkEnv({ CATALOG: "channel3", CHANNEL3_API_KEY: "c3-secret-value" }).lines.join("\n");
    expect(text).toMatch(/Channel3/);
    expect(text).not.toContain("c3-secret-value");
  });
});
