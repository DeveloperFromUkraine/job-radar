import { describe, expect, it } from "vitest";
import { type ClosureInput, type ClosureListing, decideClosures } from "./closures.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 12);
const RUN = "run-2";

const l = (
  over: Partial<ClosureListing> & Pick<ClosureListing, "listingId" | "sourceId">,
): ClosureListing => ({
  status: "open",
  publishedAt: NOW - DAY,
  expiresAt: null,
  lastSeenRunId: RUN,
  ...over,
});

function input(over: Partial<ClosureInput>): ClosureInput {
  return {
    runId: RUN,
    now: NOW,
    enabledSources: new Set(["jobicy", "himalayas", "remotive"]),
    fetches: [{ sourceId: "remotive", completeness: "complete", coversPublishedAfter: null }],
    postings: [],
    ...over,
  };
}

describe("listing closures per source verdict (ADR-0004)", () => {
  it("closes a listing absent from a complete fetch, and its posting when no other source lists it (AC-07)", () => {
    const result = decideClosures(
      input({
        postings: [
          {
            postingId: "p1",
            listings: [l({ listingId: "r1", sourceId: "remotive", lastSeenRunId: "run-1" })],
          },
        ],
      }),
    );
    expect(result.listingsToClose).toEqual(["r1"]);
    expect(result.postingsToClose).toEqual([{ postingId: "p1", creditedTo: "remotive" }]);
    expect(result.closedBySource).toEqual({ remotive: 1 });
  });

  it.each(["failed", "partial"] as const)("closes nothing from a %s fetch (AC-08)", (completeness) => {
    const result = decideClosures(
      input({
        fetches: [{ sourceId: "remotive", completeness, coversPublishedAfter: null }],
        postings: [
          {
            postingId: "p1",
            listings: [l({ listingId: "r1", sourceId: "remotive", lastSeenRunId: "run-1" })],
          },
        ],
      }),
    );
    expect(result.listingsToClose).toEqual([]);
    expect(result.postingsToClose).toEqual([]);
  });

  it("closes nothing by absence from a capped fetch, only by a direct signal (AC-08)", () => {
    const result = decideClosures(
      input({
        fetches: [{ sourceId: "himalayas", completeness: "capped", coversPublishedAfter: null }],
        postings: [
          {
            postingId: "p1",
            listings: [l({ listingId: "h1", sourceId: "himalayas", lastSeenRunId: "run-1" })],
          },
          {
            postingId: "p2",
            listings: [
              l({ listingId: "h2", sourceId: "himalayas", lastSeenRunId: "run-1", expiresAt: NOW - 1 }),
            ],
          },
        ],
      }),
    );
    expect(result.listingsToClose).toEqual(["h2"]);
    expect(result.postingsToClose).toEqual([{ postingId: "p2", creditedTo: "himalayas" }]);
  });

  it("never closes a Jobicy listing older than the window its complete response covers", () => {
    const covers = NOW - 7 * DAY + 12 * 60 * 60 * 1000;
    const result = decideClosures(
      input({
        fetches: [{ sourceId: "jobicy", completeness: "complete", coversPublishedAfter: covers }],
        postings: [
          {
            postingId: "old",
            listings: [
              l({ listingId: "j-old", sourceId: "jobicy", lastSeenRunId: "run-1", publishedAt: covers - 1 }),
            ],
          },
          {
            postingId: "new",
            listings: [
              l({ listingId: "j-new", sourceId: "jobicy", lastSeenRunId: "run-1", publishedAt: covers + 1 }),
            ],
          },
          {
            postingId: "nodate",
            listings: [
              l({ listingId: "j-nd", sourceId: "jobicy", lastSeenRunId: "run-1", publishedAt: null }),
            ],
          },
        ],
      }),
    );
    expect(result.listingsToClose).toEqual(["j-new"]);
  });
});

describe("posting closures (AC-07, AC-09, AC-26)", () => {
  it("keeps a posting open when only one of its two sources confirms (AC-09)", () => {
    const result = decideClosures(
      input({
        postings: [
          {
            postingId: "p1",
            listings: [
              l({ listingId: "r1", sourceId: "remotive", lastSeenRunId: "run-1" }),
              l({ listingId: "j1", sourceId: "jobicy" }),
            ],
          },
        ],
      }),
    );
    expect(result.listingsToClose).toEqual(["r1"]);
    expect(result.postingsToClose).toEqual([]);
  });

  it("closes when the other source had already confirmed earlier", () => {
    const result = decideClosures(
      input({
        postings: [
          {
            postingId: "p1",
            listings: [
              l({ listingId: "r1", sourceId: "remotive", lastSeenRunId: "run-1" }),
              l({ listingId: "j1", sourceId: "jobicy", status: "closed" }),
            ],
          },
        ],
      }),
    );
    expect(result.postingsToClose).toEqual([{ postingId: "p1", creditedTo: "remotive" }]);
  });

  it("ignores a disabled source's listing when deciding (AC-26)", () => {
    const result = decideClosures(
      input({
        enabledSources: new Set(["remotive"]),
        postings: [
          {
            postingId: "p1",
            listings: [
              l({ listingId: "r1", sourceId: "remotive", lastSeenRunId: "run-1" }),
              l({ listingId: "w1", sourceId: "weworkremotely" }),
            ],
          },
        ],
      }),
    );
    expect(result.postingsToClose).toEqual([{ postingId: "p1", creditedTo: "remotive" }]);
  });

  it("never closes a posting listed only by disabled sources (AC-07)", () => {
    const result = decideClosures(
      input({
        enabledSources: new Set(["remotive"]),
        postings: [
          {
            postingId: "p1",
            listings: [l({ listingId: "w1", sourceId: "weworkremotely", status: "closed" })],
          },
        ],
      }),
    );
    expect(result.postingsToClose).toEqual([]);
  });

  it("credits a closure confirmed by two sources in one run to the last one read", () => {
    const result = decideClosures(
      input({
        fetches: [
          { sourceId: "jobicy", completeness: "complete", coversPublishedAfter: null },
          { sourceId: "remotive", completeness: "complete", coversPublishedAfter: null },
        ],
        postings: [
          {
            postingId: "p1",
            listings: [
              l({ listingId: "j1", sourceId: "jobicy", lastSeenRunId: "run-1" }),
              l({ listingId: "r1", sourceId: "remotive", lastSeenRunId: "run-1" }),
            ],
          },
        ],
      }),
    );
    expect(result.postingsToClose).toEqual([{ postingId: "p1", creditedTo: "remotive" }]);
  });
});

describe("30% hold-back (AC-14)", () => {
  const openPostings = (n: number, absent: number) =>
    Array.from({ length: n }, (_, i) => ({
      postingId: `p${i}`,
      listings: [l({ listingId: `r${i}`, sourceId: "remotive", lastSeenRunId: i < absent ? "run-1" : RUN })],
    }));

  it("holds back closures above 30% of at least 10 open postings", () => {
    const result = decideClosures(input({ postings: openPostings(10, 4) }));
    expect(result.listingsToClose).toEqual([]);
    expect(result.postingsToClose).toEqual([]);
    expect(result.heldBySource).toEqual({ remotive: 4 });
  });

  it("closes exactly 30%", () => {
    const result = decideClosures(input({ postings: openPostings(10, 3) }));
    expect(result.postingsToClose).toHaveLength(3);
    expect(result.heldBySource).toEqual({});
  });

  it("does not hold back below 10 open postings", () => {
    const result = decideClosures(input({ postings: openPostings(9, 5) }));
    expect(result.postingsToClose).toHaveLength(5);
  });
});
