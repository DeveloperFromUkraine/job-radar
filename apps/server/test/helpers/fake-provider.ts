// The stand-in provider for match-score tests (test-plan.md §Levels): answers, charges and fails,
// refuses, or reports a provider/key problem, and records exactly what it was sent. Never the real API.
import type Anthropic from "@anthropic-ai/sdk";
import type { Provider, ProviderOutcome } from "../../src/modules/matching/infra/claude.js";

type Params = Anthropic.MessageCreateParamsNonStreaming;
export type Script = ProviderOutcome | ((params: Params) => ProviderOutcome | Promise<ProviderOutcome>);

export const USAGE = { inputTokens: 900, cacheWriteTokens: 1200, cacheReadTokens: 0, outputTokens: 300 };

export const scoreAnswer = (
  parts: Partial<Record<"skills" | "role_type" | "seniority" | "terms", number | "not_stated">> = {},
  over: Record<string, unknown> = {},
): ProviderOutcome => ({
  kind: "answer",
  answer: {
    parts: { skills: 95, role_type: 100, seniority: 100, terms: 70, ...parts },
    note: "Matches your core TypeScript and React at senior level. Node is not mentioned.",
    claims: [],
    ...over,
  },
  usage: USAGE,
});

export const unusable = (): ProviderOutcome => ({ kind: "answer", answer: { refusal: true }, usage: USAGE });
/** As the real client reports it: only an attempt with no HTTP answer may have been charged. */
export const problem = (
  p: "provider_unreachable" | "rate_limited" | "key_missing" | "key_refused" | "request_rejected",
  charged = p === "provider_unreachable",
): ProviderOutcome => ({
  kind: "problem",
  problem: p,
  charged,
  detail: "stand-in",
});

export interface FakeProvider extends Provider {
  /** Every request, in order. */
  sent: Params[];
  /** The text of every request, for "what was sent" assertions (AC-09, AC-20). */
  sentText(): string;
}

/** Answers each request from `script` in turn; the last entry repeats. Defaults to a usable score. */
export function fakeProvider(...script: Script[]): FakeProvider {
  const sent: Params[] = [];
  return {
    sent,
    sentText: () => sent.map((p) => JSON.stringify(p)).join("\n"),
    async send(params) {
      sent.push(params);
      const next = script.length > 1 ? (script.shift() as Script) : (script[0] ?? scoreAnswer());
      return typeof next === "function" ? next(params) : structuredClone(next);
    },
  };
}
