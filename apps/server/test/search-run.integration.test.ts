import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.js";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { readState, saveLastSkills } from "../src/modules/search/infra/repo.js";
import { addPosting, seedOpenPostings, setSearchState } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

let t: TempDb;
let deps: SearchDeps;
let snapshots: SnapshotStore;
let logged: { obj: object; msg: string }[];
const NOW = Date.UTC(2026, 9, 5, 9);

beforeEach(() => {
  t = createTempDb();
  logged = [];
  deps = { db: t.db, now: () => NOW, log: { info: (obj, msg) => logged.push({ obj, msg }) } };
  snapshots = createSnapshotStore(deps.now);
});
afterEach(() => t.cleanup());

const search = (text: string) => runSearch(deps, snapshots, text);

function caught(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("expected an AppError");
}

describe("runSearch", () => {
  it("lists exactly the open postings that mention a skill, newest first, with the count (AC-01)", () => {
    const older = addPosting(t.db, { title: "React developer", firstFoundAt: 1_000 });
    const newer = addPosting(t.db, {
      title: "Frontend",
      description: "We use TypeScript.",
      firstFoundAt: 2_000,
    });
    addPosting(t.db, { title: "Go developer", firstFoundAt: 3_000 });
    addPosting(t.db, { title: "React lead", firstFoundAt: 4_000, status: "closed" });

    const result = search("React, TypeScript");
    expect(result.total).toBe(2);
    expect(result.skills).toEqual(["React", "TypeScript"]);
    expect(result.items.map((p) => p.id)).toEqual([newer, older]);
    expect(result.items.map((p) => p.matched_skills)).toEqual([
      [{ skill: "TypeScript", in_title: false }],
      [{ skill: "React", in_title: true }],
    ]);
    expect(result.collection_empty).toBe(false);
  });

  it("shows only postings the collector holds open: closed out, reopened in (AC-04)", () => {
    addPosting(t.db, { title: "Go engineer", status: "closed" });
    const reopened = addPosting(t.db, { title: "Go engineer", status: "open" });
    expect(search("Go").items.map((p) => p.id)).toEqual([reopened]);
  });

  it("never matches text only a closed listing carries", () => {
    addPosting(t.db, {
      title: "Engineer",
      listings: [{ title: "Engineer" }, { status: "closed", sourceId: "himalayas", title: "Rust engineer" }],
    });
    expect(search("Rust").total).toBe(0);
  });

  it("is the feed for an empty field: every open posting, no matched skills, none remembered (AC-10)", () => {
    saveLastSkills(t.db, ["Go"]);
    seedOpenPostings(t.db, 3);
    addPosting(t.db, { status: "closed" });
    const result = search(" , ");
    expect(result.total).toBe(3);
    expect(result.skills).toEqual([]);
    expect(result.items.every((p) => p.matched_skills.length === 0)).toBe(true);
    expect(readState(t.db).lastSkills).toEqual([]);
  });

  it("tells nothing-matches from an empty collection (AC-11)", () => {
    expect(search("Haskell")).toMatchObject({ total: 0, items: [], collection_empty: true, has_next: false });
    addPosting(t.db, { title: "Go engineer" });
    expect(search("Haskell")).toMatchObject({
      total: 0,
      skills: ["Haskell"],
      collection_empty: false,
      next_cursor: null,
    });
  });

  it("answers 503 when the collection cannot be read, with the skills already saved (AC-12)", () => {
    deps.collection = {
      open: () => {
        throw new Error("SQLITE_BUSY");
      },
      byIds: () => [],
    };
    const err = caught(() => search("React, Go"));
    expect([err.statusCode, err.code, err.message]).toEqual([
      503,
      "SEARCH_COLLECTION_UNAVAILABLE",
      "Job-radar could not read its postings just now. Try again.",
    ]);
    expect(readState(t.db).lastSkills).toEqual(["React", "Go"]);
  });

  it("refuses invalid skills with 400, keeping the last skills and making no snapshot (AC-05)", () => {
    saveLastSkills(t.db, ["Go"]);
    const err = caught(() => search("React, --"));
    expect([err.statusCode, err.code, err.message]).toEqual([
      400,
      "SEARCH_INVALID_SKILLS",
      '"--" needs at least one letter or digit.',
    ]);
    expect(readState(t.db).lastSkills).toEqual(["Go"]);
    expect(snapshots.size()).toBe(0);
  });

  it("marks postings collected after the previous visit's start as new and counts them (AC-14)", () => {
    const late = addPosting(t.db, { title: "Go", publishedAt: 100, firstFoundAt: 2_000 }); // published early, delivered late
    const seen = addPosting(t.db, { title: "Go", publishedAt: 500, firstFoundAt: 1_000 });
    setSearchState(t.db, { previousVisitStartedAt: 1_500 });

    const result = search("Go");
    expect(result.new_count).toBe(1);
    expect(result.items.map((p) => [p.id, p.is_new])).toEqual([
      [seen, false],
      [late, true], // in its publication-time position
    ]);
  });

  it("marks nothing new on the first visit", () => {
    addPosting(t.db, { firstFoundAt: 2_000 });
    const result = search("");
    expect(result.new_count).toBe(0);
    expect(result.items[0]?.is_new).toBe(false);
  });

  it("returns the first 50 and a cursor; no cursor for 50 or fewer (AC-15)", () => {
    seedOpenPostings(t.db, 60);
    expect(search("")).toMatchObject({ total: 60, has_next: true, next_cursor: "50" });
    expect(search("").items).toHaveLength(50);
    t.cleanup();
    t = createTempDb();
    deps.db = t.db;
    seedOpenPostings(t.db, 50);
    expect(search("")).toMatchObject({ total: 50, has_next: false, next_cursor: null });
  });

  it("presents effective time, ISO times, and only safe links on open listings (AC-03, AC-08, AC-09)", () => {
    const future = Date.UTC(2030, 0, 1);
    const found = Date.UTC(2026, 9, 5, 7, 10);
    addPosting(t.db, {
      title: "<b>Go</b>",
      publishedAt: future,
      firstFoundAt: found,
      listings: [
        { sourceId: "jobicy", url: "https://jobs.example.test/1", locationRestriction: "Europe" },
        { sourceId: "remotive", url: "javascript:alert(1)", locationRestriction: null },
        { sourceId: "himalayas", status: "closed", url: "https://jobs.example.test/2" },
      ],
    });
    addPosting(t.db, { title: "Go", publishedAt: null, firstFoundAt: found - 1 });

    const [capped, unknown] = search("Go").items;
    expect(capped).toMatchObject({
      title: "<b>Go</b>",
      company: "Example Co",
      published_at: "2026-10-05T07:10:00.000Z",
      first_seen_at: "2026-10-05T07:10:00.000Z",
      listings: [
        {
          source_id: "jobicy",
          status: "open",
          url: "https://jobs.example.test/1",
          location_restriction: "Europe",
        },
        { source_id: "remotive", status: "open", url: null, location_restriction: null },
        { source_id: "himalayas", status: "closed", url: null, location_restriction: "Worldwide" },
      ],
    });
    expect(unknown?.published_at).toBeNull();
    expect(Object.keys(capped ?? {})).not.toContain("description");
  });

  it("keeps the ordered result as a snapshot", () => {
    const ids = seedOpenPostings(t.db, 3);
    const result = search("");
    expect(snapshots.get(result.snapshot_id)).toMatchObject({
      ids: [...ids].reverse(),
      skills: [],
      loadedAt: NOW,
    });
  });

  it("logs one line per search with counts only, never skill or posting text", () => {
    addPosting(t.db, { title: "Secret React role" });
    search("React, Zig");
    expect(logged).toHaveLength(1);
    expect(Object.keys(logged[0]?.obj ?? {}).sort()).toEqual([
      "durationMs",
      "matched",
      "openPostings",
      "skillCount",
    ]);
    expect(logged[0]?.obj).toMatchObject({ openPostings: 1, matched: 1, skillCount: 2 });
    expect(JSON.stringify(logged)).not.toMatch(/React|Zig|Secret/);
  });
});
