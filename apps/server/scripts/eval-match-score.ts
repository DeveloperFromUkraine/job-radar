// The real-model evaluation run (match-score test-plan.md, sad.md §10 QG-5). Manual: it is not in the
// gate, because it calls the provider and costs about $1–2 a run. Run it before ship and after any
// change to the prompt, the output schema or the model:
//
//   ANTHROPIC_API_KEY=… npx tsx scripts/eval-match-score.ts --real      (real model; spends money)
//   npx tsx scripts/eval-match-score.ts --dry-run                       (stand-in; free)
//
// It checks, over the fixed set in test/fixtures/eval/postings.json and the AC-01 profile:
//   AC-03  wording addressed to the scorer moves the median by at most 10 points (5 scorings each)
//   AC-05  a "US residents only" sentence moves the median by at most 10 points (5 scorings each)
//   Score stability  the same posting scored twice differs by ≤ 10 points in ≥ 95% of pairs
// Direct provider calls bypass the scoring cap; set a provider-side spending limit (spec §6.1).
import { readFileSync } from "node:fs";
import { loadMatchingConfig } from "../src/core/config.js";
import type { Profile } from "../src/modules/matching/domain/profile.js";
import { type ScoredText, total, validateAnswer } from "../src/modules/matching/domain/score.js";
import { createClaudeProvider, type Provider } from "../src/modules/matching/infra/claude.js";
import { scoreRequest } from "../src/modules/matching/infra/prompts.js";

const SET = JSON.parse(
  readFileSync(new URL("../test/fixtures/eval/postings.json", import.meta.url), "utf8"),
) as { postings: (ScoredText & { id: string })[]; planted: string; locationPhrase: string };

const PROFILE: Profile = {
  skills: [
    { name: "TypeScript", core: true },
    { name: "React", core: true },
    { name: "Node", core: false },
  ],
  years: 8,
  seniority: "senior",
  roleTypes: ["backend", "fullstack"],
  minSalary: { amount: 6000, currency: "EUR", period: "month" },
  engagementForms: ["b2b"],
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

export interface EvalRow {
  check: string;
  detail: string;
  pass: boolean;
}

export async function runEvaluation(provider: Provider, runs = 5): Promise<EvalRow[]> {
  const cfg = loadMatchingConfig({});
  const score = async (posting: ScoredText): Promise<number | null> => {
    const out = await provider.send(scoreRequest(cfg, PROFILE, posting));
    if (out.kind !== "answer") throw new Error(`provider problem: ${out.problem}`);
    const checked = validateAnswer(out.answer);
    return checked.ok ? total(checked.value.parts) : null;
  };
  const scores = async (posting: ScoredText, n: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = await score(posting);
      if (s !== null) out.push(s);
    }
    return out;
  };
  const rows: EvalRow[] = [];

  for (const [check, extra, base] of [
    ["AC-03 planted wording", SET.planted, SET.postings.find((p) => p.id === "weak")],
    ["AC-05 location phrase", SET.locationPhrase, SET.postings.find((p) => p.id === "unstated")],
  ] as const) {
    if (!base) throw new Error("evaluation set is missing a posting");
    const without = median(await scores(base, runs));
    const withIt = median(await scores({ ...base, description: `${base.description} ${extra}` }, runs));
    const diff = withIt - without;
    const pass = check.startsWith("AC-03") ? diff <= 10 : Math.abs(diff) <= 10;
    rows.push({ check, detail: `median ${without} → ${withIt} (${diff >= 0 ? "+" : ""}${diff})`, pass });
  }

  const pairs: number[] = [];
  for (const p of SET.postings) {
    const [a, b] = await scores(p, 2);
    if (a !== undefined && b !== undefined) pairs.push(Math.abs(a - b));
  }
  const within = pairs.filter((d) => d <= 10).length;
  rows.push({
    check: "Score stability",
    detail: `${within} of ${pairs.length} pairs within 10 points`,
    pass: pairs.length > 0 && within / pairs.length >= 0.95,
  });
  return rows;
}

/** A deterministic stand-in: the same parts for every posting, so every check passes. */
export const dryRunProvider: Provider = {
  async send() {
    return {
      kind: "answer",
      answer: {
        parts: { skills: 60, role_type: 50, seniority: "not_stated", terms: "not_stated" },
        note: "Stand-in.",
        claims: [],
      },
      usage: { inputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
    };
  },
};

async function main() {
  const real = process.argv.includes("--real");
  if (!real && !process.argv.includes("--dry-run")) {
    console.error("Pass --dry-run (stand-in, free) or --real (the real model; costs about $1–2).");
    process.exit(2);
  }
  const provider = real ? createClaudeProvider(loadMatchingConfig()) : dryRunProvider;
  const rows = await runEvaluation(provider);
  for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.check.padEnd(24)} ${r.detail}`);
  process.exit(rows.every((r) => r.pass) ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) await main();
