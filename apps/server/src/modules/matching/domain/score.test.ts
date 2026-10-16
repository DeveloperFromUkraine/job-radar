import { describe, expect, it } from "vitest";
import {
  matchState,
  SCORER_VERSION,
  type ScoreRow,
  scoringNeed,
  strikeKey,
  textFingerprint,
  total,
  validateAnswer,
} from "./score.js";

const posting = {
  title: "Senior Fullstack Engineer",
  company: "Example Co",
  description: "TypeScript and React, 7,000–9,000 EUR a month on B2B.",
  locationRestrictions: ["Europe", null],
};

const answer = (over: Record<string, unknown> = {}) => ({
  parts: { skills: 95, role_type: 100, seniority: 100, terms: 70 },
  note: "Matches your core TypeScript and React at senior level, fullstack, B2B. Node is not mentioned.",
  claims: ["visa sponsorship guaranteed"],
  ...over,
});

describe("total (AC-01 weights, AC-04 neutral rule)", () => {
  it("scores the AC-01 senior fullstack posting at least 80", () => {
    expect(total({ skills: 95, roleType: 100, seniority: 100, terms: 70 })).toBe(93);
    expect(total({ skills: 95, roleType: 100, seniority: 100, terms: 70 })).toBeGreaterThanOrEqual(80);
  });

  it("leaves a not-stated part out and shares its weight in proportion (AC-04)", () => {
    // (95·50 + 100·20 + 100·15) / 85 = 97.06
    expect(total({ skills: 95, roleType: 100, seniority: 100, terms: null })).toBe(97);
    // An unstated salary and level never lower the score below what is stated.
    expect(total({ skills: 80, roleType: 80, seniority: null, terms: null })).toBe(80);
  });

  it("has no total when nothing is stated", () => {
    expect(total({ skills: null, roleType: null, seniority: null, terms: null })).toBe(null);
  });
});

describe("validateAnswer (AC-18)", () => {
  it("accepts a usable answer, mapping 'not_stated' to null", () => {
    const r = validateAnswer(
      answer({ parts: { skills: 40, role_type: 30, seniority: "not_stated", terms: "not_stated" } }),
    );
    expect(r).toEqual({
      ok: true,
      value: {
        parts: { skills: 40, roleType: 30, seniority: null, terms: null },
        note: answer().note,
        claims: ["visa sponsorship guaranteed"],
      },
    });
  });

  it.each([
    ["no number", answer({ parts: { skills: "high", role_type: 100, seniority: 100, terms: 70 } })],
    ["a number above 100", answer({ parts: { skills: 101, role_type: 100, seniority: 100, terms: 70 } })],
    ["a negative number", answer({ parts: { skills: -1, role_type: 100, seniority: 100, terms: 70 } })],
    ["a missing part", answer({ parts: { skills: 95, role_type: 100, seniority: 100 } })],
    ["a fit note over 40 words", answer({ note: Array.from({ length: 41 }, () => "word").join(" ") })],
    ["an empty note", answer({ note: "  " })],
    ["claims that are not strings", answer({ claims: [1, 2] })],
    ["not an object", "I can't help with that."],
    ["a refusal", { refusal: true }],
  ])("refuses %s", (_name, raw) => {
    const r = validateAnswer(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^[a-z].+[^.]$/);
  });

  it("accepts a note of exactly 40 words", () => {
    expect(validateAnswer(answer({ note: Array.from({ length: 40 }, () => "word").join(" ") })).ok).toBe(
      true,
    );
  });
});

describe("textFingerprint (ADR-0005)", () => {
  it("is stable for the same scored text and ignores the order of location restrictions", () => {
    expect(textFingerprint(posting)).toBe(
      textFingerprint({ ...posting, locationRestrictions: [null, "Europe"] }),
    );
    expect(textFingerprint(posting)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["title", { title: "Staff Fullstack Engineer" }],
    ["company", { company: "Other Co" }],
    ["description", { description: "Now Go only." }],
    ["a merged listing's location", { locationRestrictions: ["Europe", null, "USA"] }],
  ])("changes with the %s", (_n, change) => {
    expect(textFingerprint({ ...posting, ...change })).not.toBe(textFingerprint(posting));
  });
});

describe("matchState (AC-06, AC-10, AC-12, AC-14, AC-18)", () => {
  const fp = textFingerprint(posting);
  const ctx = { textFingerprint: fp, profileVersion: 3, problem: null, capReached: false };
  const scored: ScoreRow = {
    total: 88,
    parts: { skills: 95, roleType: 100, seniority: 100, terms: null },
    note: "Fits.",
    claims: ["the posting says so"],
    textFingerprint: fp,
    profileVersion: 3,
    scorerVersion: SCORER_VERSION,
    strikeCount: 0,
    strikeKey: null,
    lastFailure: null,
  };
  const empty: ScoreRow = {
    ...scored,
    total: null,
    parts: { skills: null, roleType: null, seniority: null, terms: null },
    note: null,
    claims: [],
    textFingerprint: null,
    profileVersion: null,
    scorerVersion: null,
  };

  it("shows a current score", () => {
    expect(matchState(scored, ctx)).toEqual({
      state: "scored",
      total: 88,
      parts: scored.parts,
      note: "Fits.",
      claims: ["the posting says so"],
      stale: null,
      reason: null,
    });
  });

  it("marks a score made against an earlier version of the posting (AC-06)", () => {
    expect(matchState(scored, { ...ctx, textFingerprint: "other" }).stale).toBe("posting_changed");
  });

  it("marks a score made against the previous profile or scorer version (AC-10)", () => {
    expect(matchState(scored, { ...ctx, profileVersion: 4 }).stale).toBe("profile_changed");
    expect(matchState({ ...scored, scorerVersion: "0" }, ctx).stale).toBe("profile_changed");
  });

  it("says posting_changed when both changed", () => {
    expect(matchState(scored, { ...ctx, textFingerprint: "other", profileVersion: 4 }).stale).toBe(
      "posting_changed",
    );
  });

  it("keeps a stale score shown while the cap is reached or the provider is down (AC-12, AC-14)", () => {
    const s = matchState(scored, { ...ctx, profileVersion: 4, capReached: true, problem: "key_refused" });
    expect(s).toMatchObject({ state: "scored", total: 88, stale: "profile_changed" });
  });

  it("explains a missing score: pending, cap reached, provider problem", () => {
    expect(matchState(undefined, ctx)).toMatchObject({
      state: "pending",
      total: null,
      parts: null,
      note: null,
      claims: [],
    });
    expect(matchState(empty, { ...ctx, capReached: true })).toMatchObject({ state: "cap_reached" });
    const p = matchState(undefined, { ...ctx, problem: "provider_unreachable" });
    expect(p.state).toBe("not_scored");
    expect(p.reason).toMatch(/can't be reached/);
  });

  it("says could not be scored after three strikes against the current key (AC-18)", () => {
    const key = strikeKey(fp, 3, SCORER_VERSION);
    const row = {
      ...empty,
      strikeCount: 3,
      strikeKey: key,
      lastFailure: "the fit note was longer than 40 words",
    };
    expect(matchState(row, ctx)).toMatchObject({
      state: "could_not_score",
      reason: "the fit note was longer than 40 words",
    });
    // A changed posting or profile voids the strikes.
    expect(matchState(row, { ...ctx, profileVersion: 4 }).state).toBe("pending");
    expect(matchState({ ...row, strikeCount: 2 }, ctx).state).toBe("pending");
  });
});

describe("scoringNeed (flow 1 queue order)", () => {
  const fp = textFingerprint(posting);
  const ctx = { textFingerprint: fp, profileVersion: 3, problem: "key_refused" as const, capReached: true };
  const row: ScoreRow = {
    total: 70,
    parts: { skills: 70, roleType: null, seniority: null, terms: null },
    note: "Fits.",
    claims: [],
    textFingerprint: fp,
    profileVersion: 3,
    scorerVersion: SCORER_VERSION,
    strikeCount: 0,
    strikeKey: null,
    lastFailure: null,
  };

  it("puts never-scored postings in the first queue, whatever the cap or the provider", () => {
    expect(scoringNeed(undefined, ctx)).toBe("unscored");
  });

  it("puts stale scores in the second queue and current ones in none", () => {
    expect(scoringNeed(row, ctx)).toBe("none");
    expect(scoringNeed(row, { ...ctx, profileVersion: 4 })).toBe("stale");
    expect(scoringNeed(row, { ...ctx, textFingerprint: "other" })).toBe("stale");
  });

  it("never retries a posting that could not be scored until the posting or profile changes", () => {
    const given = { ...row, total: null, strikeCount: 3, strikeKey: strikeKey(fp, 3, SCORER_VERSION) };
    expect(scoringNeed(given, ctx)).toBe("none");
    expect(scoringNeed(given, { ...ctx, profileVersion: 4 })).toBe("unscored");
  });
});
