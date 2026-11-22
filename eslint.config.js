import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Correctness rules only. Formatting is not enforced here (see .editorconfig).
export default tseslint.config(
  { ignores: ["dist/**", "web/dist/**", "node_modules/**", "traces/**", "site/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "off",
    },
  },
  // Tests read loosely typed JSON from the HTTP API and from trace events; `any` there is a convenience, not a hole in the types under test.
  { files: ["test/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { files: ["web/src/**/*.{ts,tsx}"], languageOptions: { globals: { ...globals.browser } } },
);
