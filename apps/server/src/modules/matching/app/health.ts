// Scoring health (sad.md §6 flow 9, CONTEXT: Scoring health): beside the sources on SCR-02, and the
// main-screen marker when `problem` is set (AC-12, AC-14, AC-18).
import type { OpenPosting } from "../../collector/app/open-postings.js";
import { type ScoringProblem, scoringNeed, textFingerprint } from "../domain/score.js";
import { toCentsUp } from "../domain/spend.js";
import * as repo from "../infra/repo.js";
import { capState } from "./cap-state.js";
import type { MatchingDeps } from "./deps.js";
import { scoredText } from "./scored-text.js";

const REASONS: Record<ScoringProblem, string> = {
  provider_unreachable:
    "The language-model provider can't be reached right now. Scoring tries again by itself.",
  rate_limited: "The language-model provider is busy right now. Scoring tries again by itself.",
  key_missing: "No provider key is set up. Set one in your local configuration and restart job-radar.",
  key_refused: "The language-model provider refused job-radar's key. Set a valid key and restart job-radar.",
  request_rejected:
    "The language-model provider rejected job-radar's request; the server log has its message. Fix the key or account setup and restart job-radar.",
};

const day = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

export interface ScoringHealthView {
  lastSuccessAt: number | null;
  capUsdCents: number;
  spentUsdCents: number;
  capReached: boolean;
  resumesOn: string | null;
  pendingCount: number;
  oldestPendingSince: number | null;
  couldNotScoreCount: number;
  problem: { kind: ScoringProblem | "cap_reached"; reason: string; since: number } | null;
}

/** `ownerList` is search's export (ADR-0004), passed in so matching only depends on search's types. */
export function getScoringHealth(deps: MatchingDeps, ownerList: () => OpenPosting[]): ScoringHealthView {
  const settings = repo.readSettings(deps.db);
  const cap = capState(deps);

  // Pending: postings in the list with no score at all; stale ones are not counted (api-sync F-5).
  let pendingCount = 0;
  let oldestPendingSince: number | null = null;
  if (settings.profile !== null) {
    const list = ownerList();
    const rows = repo.scoresFor(
      deps.db,
      list.map((p) => p.id),
    );
    for (const p of list) {
      const ctx = {
        textFingerprint: textFingerprint(scoredText(p)),
        profileVersion: settings.profileVersion,
        problem: null,
        capReached: false,
      };
      if (scoringNeed(rows.get(p.id), ctx) !== "unscored") continue;
      pendingCount++;
      oldestPendingSince = Math.min(oldestPendingSince ?? p.firstFoundAt, p.firstFoundAt);
    }
  }

  const problem = settings.scoringProblem
    ? {
        kind: settings.scoringProblem,
        reason: REASONS[settings.scoringProblem],
        since: settings.scoringProblemAt ?? deps.now(),
      }
    : cap.reached && settings.profile !== null
      ? {
          kind: "cap_reached" as const,
          reason: `This month's scoring cap is reached. Scoring resumes on ${day(cap.window.resumesOn)}.`,
          since: repo.lastSpendAt(deps.db, cap.window.start) ?? deps.now(),
        }
      : null;

  return {
    lastSuccessAt: settings.lastSuccessAt,
    capUsdCents: Math.round(cap.cap / 10_000),
    spentUsdCents: toCentsUp(cap.spent),
    capReached: cap.reached,
    resumesOn: cap.reached ? cap.window.resumesOn : null,
    pendingCount,
    oldestPendingSince,
    couldNotScoreCount: repo.couldNotScoreCountSince(deps.db, cap.window.start),
    problem,
  };
}
