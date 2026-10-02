import { describe, expect, it } from "vitest";
import type { NormalizedListing } from "./adapter.js";
import { type Candidate, decideMerge, earliestPublishedAt, matchKey } from "./merge.js";

const DAY = 24 * 60 * 60 * 1000;
const T = Date.UTC(2026, 9, 1);

const listing = (over: Partial<NormalizedListing> = {}): NormalizedListing => ({
  sourceId: "remotive",
  sourceItemId: "r-1",
  url: "https://jobs.example.test/r-1",
  title: "Senior Backend Engineer",
  company: "Example Co",
  description: "",
  locationRestriction: null,
  categories: ["Software Development"],
  publishedAt: T,
  expiresAt: null,
  ...over,
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  postingId: "0192-a",
  status: "open",
  latestPublishedAt: T - DAY,
  listings: [{ listingId: "l-j1", sourceId: "jobicy", sourceItemId: "j-1", locationRestriction: null }],
  ...over,
});

describe("match key (AC-04)", () => {
  it.each([
    ["Senior Backend Engineer", "senior backend engineer"],
    ["Senior Backend Engineer (Remote)", "senior backend engineer"],
    ["Senior Backend Engineer - Remote", "senior backend engineer"],
    ["Senior Backend Engineer, Fully Remote", "senior backend engineer"],
    ["Senior Backend Engineer – 100% Remote", "senior backend engineer"],
    ["Remote-first Senior Backend Engineer", "senior backend engineer"],
    ["Senior Backend Engineer (Work From Home)", "senior backend engineer"],
    ["Senior Backend Engineer - WFH", "senior backend engineer"],
    ["Senior Backend Engineer, Anywhere", "senior backend engineer"],
    ["SENIOR back-end engineer!", "senior back end engineer"],
  ])("title %j normalizes to %j", (title, expected) => {
    expect(matchKey("Example Co", title).split("|")[1]).toBe(expected);
  });

  it("keeps region names, so Remote – EU and Remote – US differ", () => {
    expect(matchKey("Acme", "Backend Engineer - Remote – EU")).not.toBe(
      matchKey("Acme", "Backend Engineer - Remote – US"),
    );
    expect(matchKey("Acme", "Backend Engineer (Worldwide)")).toContain("worldwide");
  });

  it.each(["Acme Inc.", "ACME, Inc", "Acme Ltd", "Acme LLC", "Acme GmbH", "Acme Sp. z o.o.", "acme"])(
    "company %j matches plain Acme",
    (company) => {
      expect(matchKey(company, "Dev")).toBe(matchKey("Acme", "Dev"));
    },
  );

  it("does not treat different teams as the same role (AC-05)", () => {
    expect(matchKey("Acme", "Backend Engineer, Payments")).not.toBe(
      matchKey("Acme", "Backend Engineer, Search"),
    );
  });
});

describe("merge decision", () => {
  it("updates a known item without re-deciding its merge (AC-21)", () => {
    const decision = decideMerge(
      listing(),
      { listingId: "l-r1", postingId: "0192-a", postingStatus: "open" },
      [],
    );
    expect(decision).toEqual({ kind: "update-known", listingId: "l-r1", postingId: "0192-a", reopen: false });
  });

  it("reopens a closed posting when its own item is offered again (AC-11)", () => {
    const decision = decideMerge(
      listing(),
      { listingId: "l-r1", postingId: "0192-a", postingStatus: "closed" },
      [],
    );
    expect(decision).toMatchObject({ kind: "update-known", reopen: true });
  });

  it("attaches a listing from another source within 7 days (AC-04)", () => {
    expect(
      decideMerge(listing({ publishedAt: T }), null, [candidate({ latestPublishedAt: T - 7 * DAY })]),
    ).toEqual({
      kind: "attach",
      postingId: "0192-a",
      reopen: false,
    });
  });

  it("creates a new posting when publication times are more than 7 days apart", () => {
    expect(
      decideMerge(listing({ publishedAt: T }), null, [candidate({ latestPublishedAt: T - 8 * DAY })]),
    ).toEqual({
      kind: "create",
    });
  });

  it("creates a new posting when a publication time is unknown", () => {
    expect(decideMerge(listing({ publishedAt: null }), null, [candidate()])).toEqual({ kind: "create" });
  });

  it("keeps two postings apart when both state different location restrictions (AC-05)", () => {
    const c = candidate({
      listings: [{ listingId: "l-j1", sourceId: "jobicy", sourceItemId: "j-1", locationRestriction: "USA" }],
    });
    expect(decideMerge(listing({ locationRestriction: "Europe" }), null, [c])).toEqual({ kind: "create" });
  });

  it("merges when one side's location restriction is unknown (AC-05)", () => {
    const c = candidate({
      listings: [{ listingId: "l-j1", sourceId: "jobicy", sourceItemId: "j-1", locationRestriction: "USA" }],
    });
    expect(decideMerge(listing({ locationRestriction: null }), null, [c])).toMatchObject({ kind: "attach" });
  });

  it("reopens a closed, not-removed posting it merges into, keeping its id (AC-11)", () => {
    expect(decideMerge(listing(), null, [candidate({ status: "closed" })])).toEqual({
      kind: "attach",
      postingId: "0192-a",
      reopen: true,
    });
  });

  it("replaces the same source's old item when it re-posts the role (AC-04)", () => {
    const c = candidate({
      listings: [
        { listingId: "l-r0", sourceId: "remotive", sourceItemId: "r-0", locationRestriction: "USA" },
      ],
    });
    expect(decideMerge(listing({ sourceItemId: "r-1", locationRestriction: "Canada" }), null, [c])).toEqual({
      kind: "replace-same-source",
      postingId: "0192-a",
      replacesListingId: "l-r0",
      reopen: false,
    });
  });

  it("prefers the same-source re-post over a cross-source merge", () => {
    const other = candidate({ postingId: "0192-b", latestPublishedAt: T });
    const sameSource = candidate({
      postingId: "0192-c",
      latestPublishedAt: T - 3 * DAY,
      listings: [{ listingId: "l-r0", sourceId: "remotive", sourceItemId: "r-0", locationRestriction: null }],
    });
    expect(decideMerge(listing(), null, [other, sameSource])).toMatchObject({
      kind: "replace-same-source",
      postingId: "0192-c",
    });
  });

  it("picks the candidate with the most recent publication, then the oldest id (tie-break, T6)", () => {
    const a = candidate({ postingId: "0192-b", latestPublishedAt: T - 2 * DAY });
    const b = candidate({ postingId: "0192-c", latestPublishedAt: T - DAY });
    const c = candidate({ postingId: "0192-a", latestPublishedAt: T - DAY });
    expect(decideMerge(listing(), null, [a, b, c])).toMatchObject({ kind: "attach", postingId: "0192-a" });
  });
});

describe("posting display fields (AC-04 note)", () => {
  it("keeps the earliest publication time", () => {
    expect(earliestPublishedAt(T, T - DAY)).toBe(T - DAY);
    expect(earliestPublishedAt(null, T)).toBe(T);
    expect(earliestPublishedAt(T, null)).toBe(T);
  });
});

describe("same-source items that are both still live (AC-05)", () => {
  const live = (location: string | null) =>
    candidate({
      listings: [
        { listingId: "l-r0", sourceId: "remotive", sourceItemId: "r-0", locationRestriction: location },
      ],
    });

  it("keeps two live roles with different stated locations as two postings", () => {
    const decision = decideMerge(
      listing({ locationRestriction: "Germany" }),
      null,
      [live("United States")],
      new Set(["r-0", "r-1"]),
    );
    expect(decision).toEqual({ kind: "create" });
  });

  it("does not replace a live item; a duplicate without a location conflict attaches instead", () => {
    const decision = decideMerge(
      listing({ locationRestriction: null }),
      null,
      [live("United States")],
      new Set(["r-0", "r-1"]),
    );
    expect(decision).toEqual({ kind: "attach", postingId: "0192-a", reopen: false });
  });

  it("replaces the old item when it is gone from the fetch — a real re-post", () => {
    const decision = decideMerge(
      listing({ locationRestriction: "Germany" }),
      null,
      [live("United States")],
      new Set(["r-1"]),
    );
    expect(decision).toMatchObject({ kind: "replace-same-source", replacesListingId: "l-r0" });
  });
});
