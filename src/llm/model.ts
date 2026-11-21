import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";

export type Provider = "google" | "openai" | "anthropic" | "groq";

const DEFAULT_MODEL: Record<Provider, string> = {
  google: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-4-5",
  groq: "openai/gpt-oss-120b",
};

const PROVIDERS = ["google", "openai", "anthropic", "groq"] as const;

/** The environment variable that holds each provider's key. Also the order used when several keys are set and LLM_PROVIDER is not. */
export const KEY_VAR: Record<Provider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
};

export type LlmResolution =
  | { status: "none" }
  | { status: "ready"; provider: Provider; model: string; keyVar: string; /** Set when the choice was not explicit (several keys, no LLM_PROVIDER). */ note?: string }
  | { status: "misconfigured"; reason: string };

/** An empty or whitespace-only value is not a value: a blank line copied from .env.example must not count as a key. */
const val = (e: NodeJS.ProcessEnv, k: string) => (e[k] ?? "").trim();

/**
 * The one place that turns the environment into a decision. Bring your own key: set the key of the provider you use and nothing
 * else is required. LLM_PROVIDER (to choose among several keys) and LLM_MODEL (to change the default) are optional. A key that is
 * missing for the chosen provider is reported as a misconfiguration, not discovered at the first visitor's first question.
 * The result never contains a key, only the name of the variable that held it.
 */
export function resolveLlm(env: NodeJS.ProcessEnv = process.env): LlmResolution {
  const wanted = val(env, "LLM_PROVIDER").toLowerCase();
  if (wanted) {
    if (!(PROVIDERS as readonly string[]).includes(wanted)) return { status: "misconfigured", reason: `Unknown LLM_PROVIDER "${wanted}" (use google, openai, anthropic or groq)` };
    const provider = wanted as Provider;
    if (!val(env, KEY_VAR[provider])) {
      return { status: "misconfigured", reason: `LLM_PROVIDER=${provider} but ${KEY_VAR[provider]} is empty or not set` };
    }
    return { status: "ready", provider, model: val(env, "LLM_MODEL") || DEFAULT_MODEL[provider], keyVar: KEY_VAR[provider] };
  }
  const present = PROVIDERS.filter((p) => val(env, KEY_VAR[p]));
  if (present.length === 0) return { status: "none" };
  const provider = present[0];
  return {
    status: "ready", provider, model: val(env, "LLM_MODEL") || DEFAULT_MODEL[provider], keyVar: KEY_VAR[provider],
    ...(present.length > 1 ? { note: `Several keys are set (${present.map((p) => KEY_VAR[p]).join(", ")}); using ${provider}. Set LLM_PROVIDER to choose.` } : {}),
  };
}

/** True when a model can be built from this environment. */
export const hasLlmKey = (e: NodeJS.ProcessEnv = process.env) => resolveLlm(e).status === "ready";

/** One line for the start-up log: what will answer and from which variable, or what is wrong. Never a key. */
export function llmStartupLine(env: NodeJS.ProcessEnv = process.env): string {
  const r = resolveLlm(env);
  if (r.status === "none") return "Agent: offline agent (rules, no model key set; see docs/CONFIGURATION.md to bring your own)";
  if (r.status === "misconfigured") return `Agent: offline agent (rules). Model NOT configured: ${r.reason}`;
  return `Agent: ${r.provider} / ${r.model} (key from ${r.keyVar})${r.note ? `. ${r.note}` : ""}`;
}

/** One model by provider and id. The key comes from the provider's own variable in `env`. */
export function modelFor(provider: Provider, id: string, env: NodeJS.ProcessEnv = process.env): LanguageModel {
  switch (provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: val(env, KEY_VAR.google) })(id);
    case "openai":
      // OPENAI_BASE_URL: any OpenAI-compatible endpoint.
      return createOpenAI({ apiKey: val(env, KEY_VAR.openai), ...(val(env, "OPENAI_BASE_URL") ? { baseURL: val(env, "OPENAI_BASE_URL") } : {}) })(id);
    case "anthropic":
      return createAnthropic({ apiKey: val(env, KEY_VAR.anthropic) })(id);
    case "groq":
      return createGroq({ apiKey: val(env, KEY_VAR.groq) })(id);
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (use google, openai, anthropic or groq)`);
  }
}

/** Which provider and model the environment selects, without building one (for the badge and /api/health). Never includes a key. */
export function describeLlm(env: NodeJS.ProcessEnv = process.env): { provider: Provider; model: string } | undefined {
  const r = resolveLlm(env);
  return r.status === "ready" ? { provider: r.provider, model: r.model } : undefined;
}

/** Builds the LLM the environment selects. Throws a plain message when there is none or it is misconfigured. */
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): LanguageModel {
  const r = resolveLlm(env);
  if (r.status === "none") throw new Error("No LLM key set: set GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY");
  if (r.status === "misconfigured") throw new Error(r.reason);
  return modelFor(r.provider, r.model, env);
}

/** A model that has not answered after this long is cut off and the rules agent (or reader) takes over. */
export const DEFAULT_LLM_TIMEOUT_MS = 40_000;
