# Research: model monitors for prompt injection (task 24)

Written 2026-11-21 for the experiment in [EVIDENCE.md](../EVIDENCE.md#monitors-model-vs-code). Sources are first-party repositories reachable from the build environment; Groq's, Hugging Face's and OpenAI's own pages were blocked by the environment's network policy, so some API details are listed below as **unconfirmed**.

## What the two models are

- **Llama Prompt Guard 2** (Meta, `meta-llama/PurpleLlama`, directory `Llama-Prompt-Guard-2`): a small classifier for prompt attacks. Its model card describes two labels, benign and malicious (it merges the older "injection" and "jailbreak" classes), a 512-token input window, and sizes of 86M and 22M parameters. Longer inputs must be split.
- **gpt-oss-safeguard** (OpenAI, `openai/gpt-oss-safeguard`): open-weight reasoning models for classification. You supply the policy in the system prompt and the content to classify as the user message; the model reasons against the policy and answers in the format the prompt requests.

## How the experiment uses them

- Prompt Guard: the listing text is the whole prompt; the output is parsed as a probability in [0, 1] or a label word. Flagged when the score is at least `--threshold` (default 0.5, reported in the table).
- Safeguard: the policy is `SAFEGUARD_POLICY` in `src/eval/monitors/monitors.ts`, written once before any result and not tuned on the dataset; the reply must be a JSON object with `violation` 0 or 1. Anything else is an error, counted apart.
- Both are called with no automatic retries; a call that fails is an error verdict, never a miss or a hit.

## Unconfirmed (check before trusting a number)

1. The exact Groq model ids (`meta-llama/llama-prompt-guard-2-86m`, `openai/gpt-oss-safeguard-20b`). They are defaults overridable with `PROMPT_GUARD_MODEL` and `SAFEGUARD_MODEL`; an unknown id shows up as errors in the table.
2. What the hosted Prompt Guard returns through a chat-completions call (a number, a label, or something else). The parser accepts the first two and errors on anything else.
3. Groq free-tier limits for these two models.
4. Whether the 512-token window truncates any listing: listings here are short, but this was not measured.

## Reading the result

A model monitor reads untrusted text, so it can itself be steered. Whatever it measures, it is an extra layer; the controls that hold are structural (see [THREAT-MODEL.md](../THREAT-MODEL.md)).
