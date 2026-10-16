import { describe, expect, it } from "vitest";
import { bestMatchOrder, compareNewestFirst, effectiveTime } from "./order.js";

describe("effectiveTime (AC-03)", () => {
  it("uses the publication time when it is not after first collection", () => {
    expect(effectiveTime({ publishedAt: 100, firstFoundAt: 200 })).toBe(100);
  });
  it("caps a future publication time at the first-collected moment", () => {
    expect(effectiveTime({ publishedAt: 900, firstFoundAt: 200 })).toBe(200);
  });
  it("falls back to the first-collected moment when there is no publication time", () => {
    expect(effectiveTime({ publishedAt: null, firstFoundAt: 200 })).toBe(200);
  });
});

describe("compareNewestFirst (AC-03)", () => {
  const p = (id: string, publishedAt: number | null, firstFoundAt: number) => ({
    id,
    publishedAt,
    firstFoundAt,
  });

  it("orders newest first by effective time, ties by id descending, stable on every call", () => {
    const postings = [
      p("01-a", 100, 500),
      p("01-c", null, 300), // placed by first collection
      p("01-b", 100, 500), // tied with 01-a
      p("01-d", 9_999, 400), // future → 400
    ];
    const order = () => [...postings].sort(compareNewestFirst).map((x) => x.id);
    expect(order()).toEqual(["01-d", "01-c", "01-b", "01-a"]);
    expect(
      [...postings]
        .reverse()
        .sort(compareNewestFirst)
        .map((x) => x.id),
    ).toEqual(order());
  });
});

describe("bestMatchOrder with a realness penalty (match-score AC-11 amended)", () => {
  const of = (m: Record<string, number | null>) => (id: string) => m[id] ?? null;

  it("without a penalty keeps today's order: unscored first, then by score, ties newest first", () => {
    const ids = ["n1", "a", "n2", "b", "c"];
    const score = of({ a: 70, b: 90, c: 70 });
    expect(bestMatchOrder(ids, score)).toEqual(["n1", "n2", "b", "a", "c"]);
  });

  it("AC-01: orders scored postings by score minus penalty; ties keep newest first", () => {
    const ids = ["B", "A", "C", "D"]; // newest first
    const score = of({ A: 88, B: 92, C: 70, D: 72 });
    const penalty = of({ B: 25, D: 2 });
    // A 88, C 70, D 72 − 2 = 70 (tied with C, older), B 92 − 25 = 67.
    expect(bestMatchOrder(ids, score, (id) => penalty(id) ?? 0)).toEqual(["A", "C", "D", "B"]);
  });

  it("AC-05: unscored block first; no-penalty ones newest first, then by penalty ascending", () => {
    const ids = ["u1", "u2", "s1", "u3", "u4", "u5"]; // newest first
    const score = of({ s1: 99 });
    const penalty = of({ u2: 15, u4: 5, u5: 15 });
    expect(bestMatchOrder(ids, score, (id) => penalty(id) ?? 0)).toEqual([
      "u1",
      "u3",
      "u4",
      "u2",
      "u5",
      "s1",
    ]);
  });

  it("score 20 with penalty 30 sorts at −10", () => {
    const score = of({ a: 20, b: 0 });
    expect(bestMatchOrder(["a", "b"], score, (id) => (id === "a" ? 30 : 0))).toEqual(["b", "a"]);
  });
});
