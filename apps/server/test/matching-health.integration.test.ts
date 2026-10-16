import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMatchingConfig } from "../src/core/config.js";
import { type OpenPosting, postingsByIds } from "../src/modules/collector/app/open-postings.js";
import type { MatchingDeps } from "../src/modules/matching/app/deps.js";
import { getScoringHealth } from "../src/modules/matching/app/health.js";
import { createScoreReader } from "../src/modules/matching/app/score-reader.js";
import { scoredText } from "../src/modules/matching/app/scored-text.js";
import { SCORER_VERSION, strikeKey, textFingerprint } from "../src/modules/matching/domain/score.js";
import { setProblem } from "../src/modules/matching/infra/repo.js";
import { seedProfile, seedScores, seedSpend } from "./helpers/matching-fixtures.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const NOW = Date.UTC(2026, 9, 20, 10);
let t: TempDb;
let deps: MatchingDeps;
let wakes: number;
let list: OpenPosting[];

beforeEach(() => {
  t = createTempDb();
  wakes = 0;
  deps = {
    db: t.db,
    now: () => NOW,
    timeZone: "Europe/Warsaw",
    config: loadMatchingConfig({}),
    wakeScorer: () => {
      wakes++;
    },
  };
});
afterEach(() => t.cleanup());

/** `n` open postings, first found at 1000·(i+1) ms. */
function postings(n: number) {
  const ids = seedOpenPostings(t.db, n, (i) => ({ firstFoundAt: (i + 1) * 1000 }));
  return postingsByIds(t.db, ids);
}
type Five = [OpenPosting, OpenPosting, OpenPosting, OpenPosting, OpenPosting];
const fp = (p: OpenPosting) => textFingerprint(scoredText(p));
const health = () => getScoringHealth(deps, () => list);

describe("getScoringHealth (AC-12, AC-14, AC-18)", () => {
  it("healthy: last success, spend against the cap, pending and the oldest pending, could-not-score this month", () => {
    seedProfile(t.db, { profileVersion: 1, lastSuccessAt: NOW - 300_000 });
    list = postings(5);
    const [a, b, c, d] = list as Five;
    // a: current score; b: stale (pending again, but not "no score at all"); c: could not be scored; d, e: none.
    seedScores(t.db, [a.id], () => ({ textFingerprint: fp(a) }));
    seedScores(t.db, [b.id], () => ({ textFingerprint: "old" }));
    seedScores(t.db, [c.id], () => ({
      total: null,
      strikeCount: 3,
      strikeKey: strikeKey(fp(c), 1, SCORER_VERSION),
      lastFailureAt: NOW - 1000,
    }));
    seedSpend(t.db, [{ startedAt: NOW - 1000, reservedUsdMicros: 1_200_000, settledUsdMicros: 1_200_000 }]);
    expect(health()).toEqual({
      lastSuccessAt: NOW - 300_000,
      capUsdCents: 500,
      spentUsdCents: 120,
      capReached: false,
      resumesOn: null,
      pendingCount: 2,
      oldestPendingSince: d.firstFoundAt,
      couldNotScoreCount: 1,
      problem: null,
    });
  });

  it("a key problem names its reason and when it started, never the key (AC-14)", () => {
    seedProfile(t.db);
    list = [];
    setProblem(t.db, "key_refused", NOW - 60_000);
    expect(health().problem).toEqual({
      kind: "key_refused",
      reason: "The language-model provider refused job-radar's key. Set a valid key and restart job-radar.",
      since: NOW - 60_000,
    });
  });

  it("cap reached at $4.98 of $5: resumes on the first of next month (AC-12)", () => {
    seedProfile(t.db);
    list = [];
    seedSpend(t.db, [{ startedAt: NOW - 5000, reservedUsdMicros: 4_980_000, settledUsdMicros: 4_980_000 }]);
    expect(health()).toMatchObject({
      capReached: true,
      resumesOn: "2026-11-01",
      spentUsdCents: 498,
      problem: { kind: "cap_reached", since: NOW - 5000 },
    });
    expect(health().problem?.reason).toBe(
      "This month's scoring cap is reached. Scoring resumes on 1 November.",
    );
  });

  it("with no profile: zeros and no problem", () => {
    list = postings(3);
    expect(health()).toMatchObject({
      pendingCount: 0,
      oldestPendingSince: null,
      problem: null,
      capReached: false,
    });
  });
});

describe("the score reader search uses (ADR-0004)", () => {
  it("says whether there is a profile", () => {
    expect(createScoreReader(deps).hasProfile()).toBe(false);
    seedProfile(t.db);
    expect(createScoreReader(deps).hasProfile()).toBe(true);
  });

  it("gives each posting its match: current, stale by posting, stale by profile, pending, could not score (AC-06, AC-10, AC-18)", () => {
    seedProfile(t.db, { profileVersion: 2 });
    const [cur, changed, oldProfile, none, failed] = postings(5) as Five;
    seedScores(t.db, [cur.id], () => ({ textFingerprint: fp(cur), profileVersion: 2, total: 88 }));
    seedScores(t.db, [changed.id], () => ({ textFingerprint: "old", profileVersion: 2 }));
    seedScores(t.db, [oldProfile.id], () => ({ textFingerprint: fp(oldProfile), profileVersion: 1 }));
    seedScores(t.db, [failed.id], () => ({
      total: null,
      strikeCount: 3,
      strikeKey: strikeKey(fp(failed), 2, SCORER_VERSION),
      lastFailure: "the fit note was longer than 40 words",
    }));
    const m = createScoreReader(deps).matchesFor([cur, changed, oldProfile, none, failed]);
    expect(m.get(cur.id)).toMatchObject({ state: "scored", total: 88, stale: null });
    expect(m.get(changed.id)).toMatchObject({ state: "scored", stale: "posting_changed" });
    expect(m.get(oldProfile.id)).toMatchObject({ state: "scored", stale: "profile_changed" });
    expect(m.get(none.id)).toMatchObject({ state: "pending", total: null });
    expect(m.get(failed.id)).toMatchObject({
      state: "could_not_score",
      reason: "the fit note was longer than 40 words",
    });
  });

  it("shows cap reached and provider problems on postings with no score (AC-12, AC-14)", () => {
    seedProfile(t.db);
    const [p] = postings(1) as [OpenPosting];
    setProblem(t.db, "provider_unreachable", NOW);
    expect(createScoreReader(deps).matchesFor([p]).get(p.id)).toMatchObject({ state: "not_scored" });
    seedSpend(t.db, [{ startedAt: NOW - 5000, reservedUsdMicros: 5_000_000, settledUsdMicros: 5_000_000 }]);
    expect(createScoreReader(deps).matchesFor([p]).get(p.id)).toMatchObject({ state: "cap_reached" });
  });

  it("wakes the scorer when search reads a new list (AC-13)", () => {
    createScoreReader(deps).listRead();
    expect(wakes).toBe(1);
  });
});
