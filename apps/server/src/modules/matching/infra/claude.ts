// The one place job-radar talks to the provider (ADR-0002, ADR-0003). SDK retries are off, so every
// attempt passes through a spend reservation (ADR-0006); failures are classified by the SDK's typed
// errors (sad.md §8 Provider errors). The key is never put in a result, an error or a log.
import Anthropic from "@anthropic-ai/sdk";
import type { MatchingConfig } from "../../../core/config.js";
import type { ScoringProblem } from "../domain/score.js";
import type { Usage } from "../domain/spend.js";

export type ProviderOutcome =
  /** An answer the provider charged for; `answer` is the parsed JSON, `{ refusal: true }` or `{ invalid: true }`. */
  | { kind: "answer"; answer: unknown; usage: Usage }
  /** No answer: provider or key problem. `detail` is for the log (status or error class), never the key. */
  | { kind: "problem"; problem: ScoringProblem; detail: string };

export interface Provider {
  send(params: Anthropic.MessageCreateParamsNonStreaming): Promise<ProviderOutcome>;
}

type ClientOptions = { fetch?: (url: string | URL | Request, init?: RequestInit) => Promise<Response> };

export function createClaudeProvider(
  cfg: Pick<MatchingConfig, "apiKey" | "scoreTimeoutMs" | "draftTimeoutMs">,
  options: ClientOptions = {},
): Provider {
  const client = cfg.apiKey
    ? new Anthropic({
        apiKey: cfg.apiKey,
        authToken: null,
        maxRetries: 0,
        timeout: Math.max(cfg.scoreTimeoutMs, cfg.draftTimeoutMs),
        ...(options.fetch ? { fetch: options.fetch as typeof fetch } : {}),
      })
    : null;

  return {
    async send(params) {
      if (!client) return { kind: "problem", problem: "key_missing", detail: "no ANTHROPIC_API_KEY" };
      try {
        const res = await client.messages.create(params);
        const usage: Usage = {
          inputTokens: res.usage.input_tokens,
          cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
          outputTokens: res.usage.output_tokens,
        };
        if (res.stop_reason === "refusal") return { kind: "answer", answer: { refusal: true }, usage };
        const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        try {
          return { kind: "answer", answer: JSON.parse(text), usage };
        } catch {
          return { kind: "answer", answer: { invalid: true }, usage };
        }
      } catch (error) {
        return { kind: "problem", ...classify(error) };
      }
    },
  };
}

function classify(error: unknown): { problem: ScoringProblem; detail: string } {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { problem: "key_refused", detail: `status ${error.status}` };
  }
  if (error instanceof Anthropic.RateLimitError) return { problem: "rate_limited", detail: "status 429" };
  if (error instanceof Anthropic.APIConnectionError) {
    return { problem: "provider_unreachable", detail: error.constructor.name };
  }
  if (error instanceof Anthropic.APIError) {
    // ponytail: a 400/404 is job-radar's request, not the provider being down; it retries like an outage
    // (no charge, no strike). Give it its own problem kind if it ever shows up in the logs.
    return { problem: "provider_unreachable", detail: `status ${error.status}` };
  }
  return { problem: "provider_unreachable", detail: error instanceof Error ? error.name : "unknown" };
}
