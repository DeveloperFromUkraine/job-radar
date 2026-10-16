import { afterEach, describe, expect, it } from "vitest";
import { strikeKey } from "../src/modules/matching/domain/score.js";
import * as repo from "../src/modules/matching/infra/repo.js";
import { AC01_PROFILE, seedScores, seedSpend } from "./helpers/matching-fixtures.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

let t: TempDb | undefined;
afterEach(() => t?.cleanup());
const db = () => {
  t = createTempDb();
  return t.db;
};

const MONTH = Date.UTC(2026, 9, 1);
const reserveArgs = (cost: number, cap = 5_000_000) => ({
  kind: "score" as const,
  postingId: "p",
  model: "claude-opus-5-5",
  cost,
  cap,
  monthStart: MONTH,
  at: MONTH + 1000,
});

describe("settings singleton", () => {
  it("is created lazily with no profile, version 0 and the $5 cap", () => {
    expect(repo.readSettings(db())).toEqual({
      profile: null,
      profileVersion: 0,
      profileSavedAt: null,
      capUsdMicros: 5_000_000,
      noticeAgreedAt: null,
      lastSuccessAt: null,
      scoringProblem: null,
      scoringProblemAt: null,
    });
  });

  it("round-trips the profile, the cap, the problem and the last success", () => {
    const d = db();
    repo.writeProfile(d, AC01_PROFILE, 1, 100);
    repo.writeCap(d, 8_000_000);
    repo.setProblem(d, "key_refused", 200);
    repo.setProblem(d, "key_refused", 300); // the same problem keeps its first time
    repo.setLastSuccess(d, 150);
    expect(repo.readSettings(d)).toMatchObject({
      profile: AC01_PROFILE,
      profileVersion: 1,
      profileSavedAt: 100,
      capUsdMicros: 8_000_000,
      scoringProblem: "key_refused",
      scoringProblemAt: 200,
      lastSuccessAt: 150,
    });
    repo.clearProblem(d);
    expect(repo.readSettings(d)).toMatchObject({ scoringProblem: null, scoringProblemAt: null });
  });

  it("keeps the first notice agreement", () => {
    const d = db();
    repo.agreeNotice(d, 10);
    repo.agreeNotice(d, 20);
    expect(repo.readSettings(d).noticeAgreedAt).toBe(10);
  });
});

describe("spend ledger (ADR-0006)", () => {
  it("refuses a reservation that would take $4.98 past the $5 cap (AC-12)", () => {
    const d = db();
    seedSpend(d, [{ startedAt: MONTH + 1, reservedUsdMicros: 5_000_000, settledUsdMicros: 4_980_000 }]);
    expect(repo.reserve(d, reserveArgs(20_001))).toEqual({ ok: false });
    expect(repo.reserve(d, reserveArgs(20_000)).ok).toBe(true);
    expect(repo.monthSpend(d, MONTH)).toBe(5_000_000);
  });

  it("counts an open or no-answer reservation at its reserved maximum", () => {
    const d = db();
    const a = repo.reserve(d, reserveArgs(60_000));
    const b = repo.reserve(d, reserveArgs(60_000));
    if (!a.ok || !b.ok) throw new Error("reservations refused");
    expect(repo.monthSpend(d, MONTH)).toBe(120_000);
    repo.settle(d, a.id, {
      outcome: "answered",
      cost: 12_900,
      usage: { inputTokens: 1_000, cacheWriteTokens: 500, cacheReadTokens: 2_000, outputTokens: 300 },
      at: MONTH + 2000,
    });
    repo.markNoAnswer(d, b.id, MONTH + 3000, true);
    expect(repo.monthSpend(d, MONTH)).toBe(12_900 + 60_000);
  });

  it("an attempt the provider did not charge for settles at zero (AC-12, fix 2026-10-16)", () => {
    const d = db();
    const a = repo.reserve(d, reserveArgs(60_000));
    if (!a.ok) throw new Error("reservation refused");
    repo.markNoAnswer(d, a.id, MONTH + 3000, false);
    expect(repo.monthSpend(d, MONTH)).toBe(0);
  });

  it("refuses the second of two back-to-back reservations that only fit one at a time", () => {
    const d = db();
    seedSpend(d, [{ startedAt: MONTH + 1, reservedUsdMicros: 4_900_000, settledUsdMicros: 4_900_000 }]);
    expect(repo.reserve(d, reserveArgs(60_000)).ok).toBe(true);
    expect(repo.reserve(d, reserveArgs(60_000)).ok).toBe(false);
  });

  it("only counts this month", () => {
    const d = db();
    seedSpend(d, [{ startedAt: MONTH - 1, reservedUsdMicros: 5_000_000, settledUsdMicros: 5_000_000 }]);
    expect(repo.monthSpend(d, MONTH)).toBe(0);
    expect(repo.reserve(d, reserveArgs(60_000)).ok).toBe(true);
  });

  it("refuses everything at a $0 cap (AC-19)", () => {
    expect(repo.reserve(db(), reserveArgs(1, 0))).toEqual({ ok: false });
  });
});

describe("scores", () => {
  it("upserts a score, clears the strikes, and reads it back as the domain row", () => {
    const d = db();
    const [p] = seedOpenPostings(d, 1);
    if (!p) throw new Error("no posting");
    repo.addStrike(d, p, "k", "the answer had no fit note", 10);
    repo.upsertScore(
      d,
      p,
      {
        total: 93,
        parts: { skills: 95, roleType: 100, seniority: 100, terms: 70 },
        note: "Fits.",
        claims: ["visa sponsorship guaranteed"],
        textFingerprint: "fp1",
        profileVersion: 1,
        scorerVersion: "1",
      },
      20,
    );
    expect(repo.scoresFor(d, [p]).get(p)).toEqual({
      total: 93,
      parts: { skills: 95, roleType: 100, seniority: 100, terms: 70 },
      note: "Fits.",
      claims: ["visa sponsorship guaranteed"],
      textFingerprint: "fp1",
      profileVersion: 1,
      scorerVersion: "1",
      strikeCount: 0,
      strikeKey: null,
      lastFailure: null,
    });
  });

  it("counts strikes against one key and restarts them for a new key; a stale score stays (AC-18)", () => {
    const d = db();
    const [p] = seedOpenPostings(d, 1);
    if (!p) throw new Error("no posting");
    seedScores(d, [p], () => ({ total: 60 }));
    const k1 = strikeKey("fp", 1, "1");
    expect(repo.addStrike(d, p, k1, "a", 1)).toBe(1);
    expect(repo.addStrike(d, p, k1, "b", 2)).toBe(2);
    expect(repo.addStrike(d, p, k1, "c", 3)).toBe(3);
    expect(repo.scoresFor(d, [p]).get(p)).toMatchObject({ total: 60, strikeCount: 3, lastFailure: "c" });
    expect(repo.addStrike(d, p, strikeKey("fp2", 1, "1"), "d", 4)).toBe(1);
  });

  it("counts postings that could not be scored since a time", () => {
    const d = db();
    const ids = seedOpenPostings(d, 3);
    seedScores(d, ids, (i) => ({ total: null, strikeCount: [3, 3, 2][i], lastFailureAt: [5, 50, 50][i] }));
    expect(repo.couldNotScoreCountSince(d, 10)).toBe(1);
  });

  it("reads scores for many ids at once", () => {
    const d = db();
    const ids = seedOpenPostings(d, 1200);
    seedScores(d, ids);
    expect(repo.scoresFor(d, ids).size).toBe(1200);
  });
});
