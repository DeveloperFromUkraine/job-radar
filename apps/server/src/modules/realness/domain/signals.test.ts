import { describe, expect, it } from "vitest";
import { daysAgo, type RealnessFacts, realnessOf, repostByLookAlike } from "./signals.js";

const TZ = "Europe/Warsaw";
const DAY = 24 * 60 * 60 * 1000;
// 2026-10-16 12:00 in Warsaw (UTC+2).
const NOW = Date.UTC(2026, 9, 16, 10, 0);
const ago = (days: number) => NOW - days * DAY;

const facts = (over: Partial<RealnessFacts> = {}): RealnessFacts => ({
  publishedAt: null,
  firstFoundAt: NOW,
  enabledOpenBoards: 1,
  reopened: false,
  repostByLookAlike: false,
  noSalary: false,
  ...over,
});

describe("daysAgo — calendar days in the owner's zone", () => {
  it("counts calendar days, not 24-hour spans", () => {
    // 23:30 yesterday in Warsaw is 1 day ago, though only 12.5 hours have passed.
    expect(daysAgo(Date.UTC(2026, 9, 15, 21, 30), NOW, TZ)).toBe(1);
    // 00:30 today in Warsaw is 0 days ago.
    expect(daysAgo(Date.UTC(2026, 9, 15, 22, 30), NOW, TZ)).toBe(0);
    expect(daysAgo(ago(47), NOW, TZ)).toBe(47);
  });

  it("counts across the DST change (25 October) by calendar day", () => {
    const after = Date.UTC(2026, 9, 27, 10, 0);
    expect(daysAgo(Date.UTC(2026, 9, 24, 10, 0), after, TZ)).toBe(3);
  });
});

describe("realnessOf — penalty and signals (AC-01, AC-02, AC-07, AC-09)", () => {
  it.each([
    [29, 0, []],
    [30, 10, [{ kind: "age", basis: "first_found", days: 30 }]],
    [59, 10, [{ kind: "age", basis: "first_found", days: 59 }]],
    [60, 20, [{ kind: "age", basis: "first_found", days: 60 }]],
  ])("first found %i days ago → penalty %i", (days, penalty, signals) => {
    expect(realnessOf(facts({ firstFoundAt: ago(days) }), NOW, TZ)).toEqual({ penalty, signals });
  });

  it("says posted only when the publication time is what age counts from", () => {
    expect(realnessOf(facts({ publishedAt: ago(65), firstFoundAt: ago(10) }), NOW, TZ).signals).toEqual([
      { kind: "age", basis: "posted", days: 65 },
    ]);
    // A publication time later than first found → counts from first found.
    expect(realnessOf(facts({ publishedAt: ago(5), firstFoundAt: ago(40) }), NOW, TZ).signals).toEqual([
      { kind: "age", basis: "first_found", days: 40 },
    ]);
    // Equal times: the publication time is what it counts from.
    expect(realnessOf(facts({ publishedAt: ago(40), firstFoundAt: ago(40) }), NOW, TZ).signals).toEqual([
      { kind: "age", basis: "posted", days: 40 },
    ]);
  });

  it("many boards needs 3 enabled boards and first found 45 days ago", () => {
    expect(realnessOf(facts({ enabledOpenBoards: 3, firstFoundAt: ago(44) }), NOW, TZ)).toEqual({
      penalty: 10,
      signals: [{ kind: "age", basis: "first_found", days: 44 }],
    });
    expect(realnessOf(facts({ enabledOpenBoards: 3, firstFoundAt: ago(45) }), NOW, TZ)).toEqual({
      penalty: 15,
      signals: [{ kind: "many_boards", boards: 3, days: 45 }],
    });
    expect(realnessOf(facts({ enabledOpenBoards: 2, firstFoundAt: ago(50) }), NOW, TZ)).toEqual({
      penalty: 10,
      signals: [{ kind: "age", basis: "first_found", days: 50 }],
    });
  });

  it("only the larger of age and many boards counts and is named", () => {
    // Age 20 beats many boards 15.
    expect(realnessOf(facts({ enabledOpenBoards: 4, firstFoundAt: ago(60) }), NOW, TZ)).toEqual({
      penalty: 20,
      signals: [{ kind: "age", basis: "first_found", days: 60 }],
    });
    // Many boards 15 beats age 10; days are since first found, even when published earlier.
    expect(
      realnessOf(facts({ enabledOpenBoards: 4, publishedAt: ago(55), firstFoundAt: ago(50) }), NOW, TZ),
    ).toEqual({ penalty: 15, signals: [{ kind: "many_boards", boards: 4, days: 50 }] });
  });

  it("caps the total at 30 and names every signal in order: time, repost, no salary", () => {
    expect(realnessOf(facts({ firstFoundAt: ago(65), reopened: true, noSalary: true }), NOW, TZ)).toEqual({
      penalty: 30,
      signals: [{ kind: "age", basis: "first_found", days: 65 }, { kind: "repost" }, { kind: "no_salary" }],
    });
  });

  it("AC-02 example: first found 47 days ago, reposted, no salary → 25", () => {
    expect(
      realnessOf(facts({ firstFoundAt: ago(47), repostByLookAlike: true, noSalary: true }), NOW, TZ),
    ).toEqual({
      penalty: 25,
      signals: [{ kind: "age", basis: "first_found", days: 47 }, { kind: "repost" }, { kind: "no_salary" }],
    });
  });

  it("AC-01 example: posted 65 days ago with no salary → 25", () => {
    expect(
      realnessOf(facts({ publishedAt: ago(65), firstFoundAt: ago(65), noSalary: true }), NOW, TZ),
    ).toEqual({
      penalty: 25,
      signals: [{ kind: "age", basis: "posted", days: 65 }, { kind: "no_salary" }],
    });
  });

  it("a reopening or a look-alike repost is one repost signal worth 10", () => {
    expect(realnessOf(facts({ reopened: true, repostByLookAlike: true }), NOW, TZ)).toEqual({
      penalty: 10,
      signals: [{ kind: "repost" }],
    });
  });

  it("no signal → penalty 0 and no signals", () => {
    expect(realnessOf(facts(), NOW, TZ)).toEqual({ penalty: 0, signals: [] });
  });
});

describe("repostByLookAlike (AC-08)", () => {
  const me = { publishedAt: null, firstFoundAt: ago(2) };
  const closed = (days: number) => ({
    status: "closed" as const,
    publishedAt: null,
    firstFoundAt: ago(days),
  });
  const open = (days: number) => ({ status: "open" as const, publishedAt: null, firstFoundAt: ago(days) });

  it("needs an earlier closed copy more than 7 days before this one", () => {
    expect(repostByLookAlike(me, [closed(9)])).toBe(false); // exactly 7 days earlier
    expect(repostByLookAlike(me, [closed(10)])).toBe(true);
    expect(repostByLookAlike(me, [])).toBe(false); // earlier copy removed by clean-up
  });

  it("an earlier copy still open means parallel hires — no repost", () => {
    expect(repostByLookAlike(me, [open(30)])).toBe(false);
    expect(repostByLookAlike(me, [closed(30), open(20)])).toBe(false);
  });

  it("a later closed copy is not an earlier one", () => {
    expect(repostByLookAlike({ publishedAt: null, firstFoundAt: ago(30) }, [closed(2)])).toBe(false);
  });

  it("first-fill copies found the same day but published more than 7 days apart are a repost", () => {
    const found = ago(1);
    const later = { publishedAt: ago(3), firstFoundAt: found };
    const earlier = { status: "closed" as const, publishedAt: ago(20), firstFoundAt: found };
    expect(repostByLookAlike(later, [earlier])).toBe(true);
  });
});
