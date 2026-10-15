// A stand-in ScoreReader for search tests (match-score test-plan.md, sad.md §10 QG-1): returns the given
// score state per posting id, or "pending" for the rest; can be made unreadable.
import type { MatchView, ScoreReader } from "../../src/modules/search/app/deps.js";

export const scored = (total: number, over: Partial<MatchView> = {}): MatchView => ({
  state: "scored",
  total,
  parts: { skills: total, roleType: total, seniority: null, terms: null },
  note: `Fits at ${total}.`,
  claims: [],
  stale: null,
  reason: null,
  ...over,
});

export const notScored = (state: Exclude<MatchView["state"], "scored">, reason: string): MatchView => ({
  state,
  total: null,
  parts: null,
  note: null,
  claims: [],
  stale: null,
  reason,
});

export interface FakeScoreReader extends ScoreReader {
  listReads: number;
  /** Ids asked for, per call. */
  asked: string[][];
}

export function fakeScoreReader(
  matches: ReadonlyMap<string, MatchView> = new Map(),
  opts: { hasProfile?: boolean; unreadable?: boolean } = {},
): FakeScoreReader {
  const reader: FakeScoreReader = {
    listReads: 0,
    asked: [],
    hasProfile: () => opts.hasProfile ?? true,
    matchesFor(postings) {
      if (opts.unreadable) throw new Error("matching unreadable");
      reader.asked.push(postings.map((p) => p.id));
      return new Map(
        postings.map((p) => [p.id, matches.get(p.id) ?? notScored("pending", "waiting to be scored")]),
      );
    },
    listRead() {
      reader.listReads++;
    },
  };
  return reader;
}
