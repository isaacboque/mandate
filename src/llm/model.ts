import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

export type Provider = "google" | "openai" | "anthropic";

const DEFAULT_MODEL: Record<Provider, string> = {
  google: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-4-5",
};

export const hasLlmKey = (e: NodeJS.ProcessEnv = process.env) =>
  Boolean(e.GOOGLE_GENERATIVE_AI_API_KEY || e.OPENAI_API_KEY || e.ANTHROPIC_API_KEY);

/** Picks the LLM from env: LLM_PROVIDER, LLM_MODEL (optional) and the provider's own API key variable. */
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): LanguageModel {
  const provider = (env.LLM_PROVIDER ?? "google") as Provider;
  const id = env.LLM_MODEL || DEFAULT_MODEL[provider];
  switch (provider) {
    case "google":
      return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(id);
    case "openai":
      return createOpenAI({ apiKey: env.OPENAI_API_KEY })(id);
    case "anthropic":
      return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(id);
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (use google, openai or anthropic)`);
  }
}
