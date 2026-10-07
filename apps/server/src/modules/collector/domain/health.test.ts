import { describe, expect, it } from "vitest";
import {
  evaluateFlags,
  type FlagInput,
  failureReasonText,
  overdueReason,
  raisesMarker,
  runningTimeSince,
} from "./health.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 2, 12);

const ok = (items = 5, newListings = 4, unknown = 0) => ({
  outcome: "complete" as const,
  itemsReturned: items,
  newListings,
  unknownLocationNew: unknown,
  failureReason: null,
  startedAt: NOW,
});
const failed = (reason = "The source did not answer within 30 seconds.") => ({
  outcome: "failed" as const,
  itemsReturned: null,
  newListings: 0,
  unknownLocationNew: 0,
  failureReason: reason,
  startedAt: NOW,
});

const base = (over: Partial<FlagInput> = {}): FlagInput => ({
  now: NOW,
  firstSuccessAt: NOW - 30 * DAY,
  recentOutcomes: [ok()],
  currentFlags: [],
  held: null,
  ownerCategories: ["Software Development"],
  publishedCategories: ["Software Development", "Devops"],
  categoriesMatchedLast7Days: ["Software Development"],
  ...over,
});

const kinds = (input: FlagInput) => evaluateFlags(input).raised.map((f) => f.kind);

describe("failing (AC-03, AC-13)", () => {
  it("raises after two consecutive failed due runs, naming the reason", () => {
    const { raised } = evaluateFlags(base({ recentOutcomes: [failed(), failed()] }));
    expect(raised).toEqual([
      {
        kind: "failing",
        reason: "Failed on the last 2 due runs - the source did not answer within 30 seconds.",
      },
    ]);
  });

  it("does not raise after a single failure", () => {
    expect(kinds(base({ recentOutcomes: [failed(), ok()] }))).toEqual([]);
  });

  it("does not count a partial fetch as a failure", () => {
    const partial = { ...ok(), outcome: "partial" as const };
    expect(kinds(base({ recentOutcomes: [partial, failed()] }))).toEqual([]);
  });

  it("keeps the flag until a successful read returns items, then clears it", () => {
    const zero = ok(0, 0);
    expect(
      evaluateFlags(base({ recentOutcomes: [zero, failed()], currentFlags: ["failing"] })).cleared,
    ).toEqual([]);
    expect(
      evaluateFlags(base({ recentOutcomes: [ok(), failed()], currentFlags: ["failing"] })).cleared,
    ).toEqual(["failing"]);
  });

  it("ignores runs left pending by an interruption", () => {
    const pending = { ...failed(), outcome: "pending" as const };
    expect(kinds(base({ recentOutcomes: [failed(), pending, failed()] }))).toEqual(["failing"]);
  });
});

describe("silent (AC-13)", () => {
  it("raises after zero items on two consecutive due runs", () => {
    expect(kinds(base({ recentOutcomes: [ok(0, 0), ok(0, 0)] }))).toEqual(["silent"]);
  });

  it("does not raise when items came back but none were new", () => {
    expect(kinds(base({ recentOutcomes: [ok(12, 0), ok(9, 0)] }))).toEqual([]);
  });
});

describe("held back (AC-14)", () => {
  it("raises with the share in the reason and clears when the next run is at or under 30%", () => {
    const held = { held: 4, open: 10 };
    expect(evaluateFlags(base({ held })).raised).toEqual([
      { kind: "held_back", reason: "Would close 40% of its 10 open postings - 4 closures held back." },
    ]);
    expect(evaluateFlags(base({ held: null, currentFlags: ["held_back"] })).cleared).toEqual(["held_back"]);
  });
});

describe("unknown location share (AC-25)", () => {
  const history = Array.from({ length: 7 }, () => ({ ...ok(10, 10, 2), startedAt: NOW - 2 * DAY }));

  it("flags a run where over half the new listings are unknown and the share doubled", () => {
    const { raised } = evaluateFlags(base({ recentOutcomes: [ok(10, 10, 6), ...history] }));
    expect(raised).toEqual([
      {
        kind: "unknown_location",
        reason: "60% of new listings state no location restriction (usually 20%).",
      },
    ]);
  });

  it("does not flag before the source has 7 days of history", () => {
    expect(
      kinds(base({ firstSuccessAt: NOW - 6 * DAY, recentOutcomes: [ok(10, 10, 6), ...history] })),
    ).toEqual([]);
  });

  it("does not flag when the share is high but not twice the usual", () => {
    const usual = history.map((h) => ({ ...h, unknownLocationNew: 4 }));
    expect(kinds(base({ recentOutcomes: [ok(10, 10, 6), ...usual] }))).toEqual([]);
  });
});

describe("category matched nothing (AC-24)", () => {
  it("flags a category missing from the source's published list", () => {
    const { raised } = evaluateFlags(base({ ownerCategories: ["Software Development", "Blockchain"] }));
    expect(raised).toEqual([
      { kind: "category_unmatched", reason: 'Category "Blockchain" matched nothing at the source.' },
    ]);
  });

  it("for a source without a list, flags a category that matched no listing in 7 days", () => {
    const { raised } = evaluateFlags(
      base({
        publishedCategories: null,
        ownerCategories: ["Developer", "Data Science"],
        categoriesMatchedLast7Days: ["Developer"],
      }),
    );
    expect(raised.map((f) => f.reason)).toEqual(['Category "Data Science" matched nothing at the source.']);
  });

  it("does not show on the main-screen marker", () => {
    expect(raisesMarker("category_unmatched")).toBe(false);
    for (const kind of ["failing", "silent", "overdue", "held_back", "unknown_location"] as const) {
      expect(raisesMarker(kind)).toBe(true);
    }
  });
});

describe("overdue (AC-13, read time)", () => {
  const sessions = [
    { startedAt: NOW - 10 * HOUR, lastSeenAt: NOW - 8 * HOUR },
    { startedAt: NOW - 2 * HOUR, lastSeenAt: NOW },
  ];

  it("counts only the time the app was running since the last read", () => {
    expect(runningTimeSince(NOW - 9 * HOUR, sessions, NOW)).toBe(HOUR + 2 * HOUR);
  });

  it("is overdue after more than twice the interval of running time", () => {
    expect(overdueReason(NOW - 9 * HOUR, HOUR, sessions, NOW)).toBe(
      "Not read for 3 h while the app was running - it is due every 1 h.",
    );
    expect(overdueReason(NOW - 9 * HOUR, 6 * HOUR, sessions, NOW)).toBeNull();
  });

  it("is not overdue while the laptop slept", () => {
    expect(
      overdueReason(NOW - 9 * HOUR, HOUR, [{ startedAt: NOW - 30 * MIN, lastSeenAt: NOW }], NOW),
    ).toBeNull();
  });
});

describe("plain-language failure reasons (AC-03)", () => {
  it.each([
    ["unreachable", "The source could not be reached."],
    ["refused", "The source refused the request."],
    ["too_large", "The response was larger than 10 MB."],
    ["timed_out", "The source did not answer within 30 seconds."],
    ["unreadable", "The response could not be read."],
  ] as const)("%s", (code, text) => {
    expect(failureReasonText(code)).toBe(text);
  });
});

describe("clearing only on the evidence each AC names (review A5, C4)", () => {
  it("keeps held_back after a run that could not re-check closures", () => {
    expect(
      evaluateFlags(base({ recentOutcomes: [failed(), ok()], held: null, currentFlags: ["held_back"] }))
        .cleared,
    ).toEqual([]);
    const partial = { ...ok(), outcome: "partial" as const };
    expect(
      evaluateFlags(base({ recentOutcomes: [partial], held: null, currentFlags: ["held_back"] })).cleared,
    ).toEqual([]);
  });

  it("clears held_back after a complete re-check at or under 30%", () => {
    expect(
      evaluateFlags(base({ recentOutcomes: [ok()], held: null, currentFlags: ["held_back"] })).cleared,
    ).toEqual(["held_back"]);
  });

  it("keeps unknown_location after a run with no new listings", () => {
    expect(
      evaluateFlags(base({ recentOutcomes: [failed()], currentFlags: ["unknown_location"] })).cleared,
    ).not.toContain("unknown_location");
    expect(
      evaluateFlags(base({ recentOutcomes: [ok(5, 0)], currentFlags: ["unknown_location"] })).cleared,
    ).not.toContain("unknown_location");
  });

  it("does not count a rate-limited empty read as silent", () => {
    const limited = { ...ok(), outcome: "partial" as const, itemsReturned: null };
    expect(kinds(base({ recentOutcomes: [limited, limited] }))).toEqual([]);
  });
});

describe("held_back needs a real re-check (round-2 review R2)", () => {
  const capped = { ...ok(), outcome: "capped" as const };

  it("stays after a capped run when the source closes only by absence", () => {
    expect(
      evaluateFlags(
        base({ recentOutcomes: [capped], held: null, currentFlags: ["held_back"], closuresRechecked: false }),
      ).cleared,
    ).toEqual([]);
  });

  it("clears after a capped run of a source whose close signal is an expiry date", () => {
    expect(
      evaluateFlags(
        base({ recentOutcomes: [capped], held: null, currentFlags: ["held_back"], closuresRechecked: true }),
      ).cleared,
    ).toEqual(["held_back"]);
  });
});

describe("overdue wording (round-2 review R3)", () => {
  const sessions = [{ startedAt: NOW - 10 * HOUR, lastSeenAt: NOW }];

  it("says the source was not read when it was not", () => {
    expect(overdueReason(NOW - 3 * HOUR, HOUR, sessions, NOW)).toBe(
      "Not read for 3 h while the app was running - it is due every 1 h.",
    );
  });

  it("says no read returned items when reads were attempted", () => {
    expect(overdueReason(NOW - 3 * HOUR, HOUR, sessions, NOW, { attemptedSince: true })).toBe(
      "No successful read with items for 3 h while the app was running - it is due every 1 h.",
    );
  });
});
