import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  // Reported in CI, no threshold: a number that fails the build is a decision for the maintainer.
  test: { coverage: { provider: "v8", reporter: ["text-summary"], include: ["src/**"] } },
});
