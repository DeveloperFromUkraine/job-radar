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
  /**
   * No answer: provider or key problem. `charged` is false when the provider answered with an error or
   * nothing was sent: such an attempt costs nothing (AC-12, fix 2026-10-16). `detail` is for the log
   * (status, error class or the provider's own message), never the key.
   */
  | { kind: "problem"; problem: ScoringProblem; charged: boolean; detail: string };

export interface SendOptions {
  /** The score or the draft timeout (sad.md §8): the caller knows which request this is. */
  timeoutMs?: number;
  /** Aborted when the scorer stops (ADR-0003). */
  signal?: AbortSignal;
}

export interface Provider {
  send(params: Anthropic.MessageCreateParamsNonStreaming, opts?: SendOptions): Promise<ProviderOutcome>;
}

type ClientOptions = { fetch?: (url: string | URL | Request, init?: RequestInit) => Promise<Response> };

export function createClaudeProvider(
  cfg: Pick<MatchingConfig, "apiKey">,
  options: ClientOptions = {},
): Provider {
  const client = cfg.apiKey
    ? new Anthropic({
        apiKey: cfg.apiKey,
        authToken: null,
        maxRetries: 0,
        ...(options.fetch ? { fetch: options.fetch as typeof fetch } : {}),
      })
    : null;

  return {
    async send(params, opts = {}) {
      if (!client)
        return { kind: "problem", problem: "key_missing", charged: false, detail: "no ANTHROPIC_API_KEY" };
      try {
        const res = await client.messages.create(params, {
          ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
          ...(opts.signal ? { signal: opts.signal } : {}),
        });
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

function classify(error: unknown): { problem: ScoringProblem; charged: boolean; detail: string } {
  // No HTTP answer (connection lost, timeout, abort): the provider may have charged, so it counts (ADR-0006).
  if (!(error instanceof Anthropic.APIError) || typeof error.status !== "number") {
    const detail = error instanceof Error ? error.constructor.name : "unknown";
    return { problem: "provider_unreachable", charged: true, detail };
  }
  // An error answer: the provider charged nothing (AC-12, fix 2026-10-16).
  const status = error.status;
  if (status === 401 || status === 403)
    return { problem: "key_refused", charged: false, detail: `status ${status}` };
  if (status === 429) return { problem: "rate_limited", charged: false, detail: "status 429" };
  if (status >= 500) return { problem: "provider_unreachable", charged: false, detail: `status ${status}` };
  // Any other 4xx is a request the provider will keep rejecting (seen live: a key not scoped to a
  // workspace). Its own message goes to the log so the owner can fix the setup.
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = typeof body?.error?.message === "string" ? `: ${body.error.message.slice(0, 300)}` : "";
  return { problem: "request_rejected", charged: false, detail: `status ${status}${message}` };
}
