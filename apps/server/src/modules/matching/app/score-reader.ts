// Matching's implementation of search's ScoreReader (ADR-0004), wired in app.ts. Each posting's match is
// computed from its current text, so staleness needs no event from the collector (ADR-0005).
import type { OpenPosting } from "../../collector/app/open-postings.js";
import type { MatchView, ScoreReader } from "../../search/app/deps.js";
import { matchState, textFingerprint } from "../domain/score.js";
import * as repo from "../infra/repo.js";
import { capState } from "./cap-state.js";
import type { MatchingDeps } from "./deps.js";
import { scoredText } from "./scored-text.js";

export function createScoreReader(deps: MatchingDeps): ScoreReader {
  return {
    hasProfile: () => repo.readSettings(deps.db).profile !== null,
    matchesFor(postings: readonly OpenPosting[]) {
      const settings = repo.readSettings(deps.db);
      const rows = repo.scoresFor(
        deps.db,
        postings.map((p) => p.id),
      );
      const capReached = capState(deps).reached;
      const out = new Map<string, MatchView>();
      for (const p of postings) {
        out.set(
          p.id,
          matchState(rows.get(p.id), {
            textFingerprint: textFingerprint(scoredText(p)),
            profileVersion: settings.profileVersion,
            problem: settings.scoringProblem,
            capReached,
          }),
        );
      }
      return out;
    },
    listRead: () => deps.wakeScorer(),
  };
}
