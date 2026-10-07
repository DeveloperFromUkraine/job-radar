import { describe, expect, it } from "vitest";
import { compareNewestFirst, effectiveTime } from "./order.js";

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
