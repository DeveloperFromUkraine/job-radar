// One scoring attempt (sad.md §6 flow 1; ADR-0006, ADR-0008): reserve the largest possible cost, ask,
// validate, then store the score or add a strike, and settle. A provider or key problem keeps the
// reservation as spent and records the problem; it is never a strike (AC-14 note).
import type { OpenPosting } from "../../collector/app/open-postings.js";
import type { Profile } from "../domain/profile.js";
import {
  SCORER_VERSION,
  type ScoringProblem,
  strikeKey,
  textFingerprint,
  total,
  validateAnswer,
} from "../domain/score.js";
import { maxCostMicros, monthWindow, settledCostMicros } from "../domain/spend.js";
import { createClaudeProvider } from "../infra/claude.js";
import { requestBytes, scoreRequest } from "../infra/prompts.js";
import * as repo from "../infra/repo.js";
import type { MatchingDeps } from "./deps.js";
import { scoredText } from "./scored-text.js";

export type AttemptResult =
  | { kind: "scored"; total: number }
  | { kind: "strike"; strikes: number }
  | { kind: "cap_reached" }
  | { kind: "provider_problem"; problem: ScoringProblem };

export async function scoreOne(
  deps: MatchingDeps,
  posting: OpenPosting,
  profile: Profile,
  profileVersion: number,
  signal?: AbortSignal,
): Promise<AttemptResult> {
  const { config: cfg, db } = deps;
  const text = scoredText(posting);
  const fingerprint = textFingerprint(text);
  const params = scoreRequest(cfg, profile, text);
  const maxCost = maxCostMicros(requestBytes(params), cfg.scoreOutputLimit, cfg.price);
  const monthStart = monthWindow(deps.now(), deps.timeZone).start;
  const reservation = repo.reserve(db, {
    kind: "score",
    postingId: posting.id,
    model: cfg.model,
    cost: maxCost,
    cap: repo.readSettings(db).capUsdMicros,
    monthStart,
    at: deps.now(),
  });
  if (!reservation.ok) {
    deps.capRefused = { monthStart, cost: maxCost };
    return { kind: "cap_reached" };
  }
  deps.capRefused = undefined; // the cap fits the queue again (review R23)

  const outcome = await (deps.provider ?? createClaudeProvider(cfg)).send(params, {
    timeoutMs: cfg.scoreTimeoutMs,
    signal,
  });
  const log = (o: object) =>
    deps.log?.info({ module: "matching", postingId: posting.id, ...o }, "scoring attempt");

  if (outcome.kind === "problem") {
    repo.markNoAnswer(db, reservation.id, deps.now(), outcome.charged);
    // Stopped by shutdown: no answer, but not a provider problem to show (review R10).
    if (signal?.aborted) return { kind: "provider_problem", problem: outcome.problem };
    repo.setProblem(db, outcome.problem, deps.now());
    log({ outcome: "provider_problem", problem: outcome.problem, detail: outcome.detail });
    return { kind: "provider_problem", problem: outcome.problem };
  }

  const cost = settledCostMicros(outcome.usage, cfg.price);
  const tokens = { ...outcome.usage, costUsdMicros: cost };
  repo.clearProblem(db); // the provider answered
  const checked = validateAnswer(outcome.answer);
  // An answer that states no part has no score either: a strike, like any unusable answer (AC-18).
  const score = checked.ok ? total(checked.value.parts) : null;
  if (!checked.ok || score === null) {
    repo.settle(db, reservation.id, { outcome: "unusable", cost, usage: outcome.usage, at: deps.now() });
    const key = strikeKey(fingerprint, profileVersion, SCORER_VERSION);
    const reason = checked.ok ? "the answer stated no part" : checked.reason;
    const strikes = repo.addStrike(db, posting.id, key, reason, deps.now());
    log({ outcome: "strike", strikes, ...tokens });
    return { kind: "strike", strikes };
  }

  // Settled before the score is stored: a posting removed during the call fails the write, not the ledger.
  repo.settle(db, reservation.id, { outcome: "answered", cost, usage: outcome.usage, at: deps.now() });
  const { parts, note, claims } = checked.value;
  repo.upsertScore(
    db,
    posting.id,
    {
      total: score,
      parts,
      note,
      claims,
      textFingerprint: fingerprint,
      profileVersion,
      scorerVersion: SCORER_VERSION,
    },
    deps.now(),
  );
  repo.setLastSuccess(db, deps.now());
  log({ outcome: "scored", total: score, ...tokens });
  return { kind: "scored", total: score };
}
