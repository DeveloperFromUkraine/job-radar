import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { ownerList } from "../src/modules/search/app/owner-list.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { MAX_AGE_DAYS } from "../src/modules/search/domain/order.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 17, 12);
let t: TempDb;
let deps: SearchDeps;

beforeEach(() => {
  t = createTempDb();
  deps = { db: t.db, now: () => NOW, maxAgeDays: MAX_AGE_DAYS };
  openVisit(deps);
});
afterEach(() => t.cleanup());

describe("only fresh postings: at most 30 days old (the owner's choice, 2026-10-17)", () => {
  it("lists and scores postings up to 30 days old, never older ones, however recently found", () => {
    const fresh = addPosting(t.db, { title: "Fresh", publishedAt: NOW - 3 * DAY, firstFoundAt: NOW - DAY });
    const edge = addPosting(t.db, { title: "Edge", publishedAt: NOW - 30 * DAY, firstFoundAt: NOW - DAY });
    addPosting(t.db, { title: "Stale", publishedAt: NOW - 31 * DAY, firstFoundAt: NOW - DAY });
    // A board's years-old job, found today: its publication time counts.
    addPosting(t.db, { title: "Ancient", publishedAt: NOW - 1600 * DAY, firstFoundAt: NOW });
    // No publication time: counts from when job-radar first found it.
    addPosting(t.db, { title: "Undated old", publishedAt: null, firstFoundAt: NOW - 45 * DAY });

    const result = runSearch(deps, createSnapshotStore(deps.now), "");

    expect(result.items.map((p) => p.id).sort()).toEqual([fresh, edge].sort());
    expect(result.total).toBe(2);
    // The scorer's list is the same: nothing is spent on stale postings.
    expect(
      ownerList(deps)
        .map((p) => p.id)
        .sort(),
    ).toEqual([fresh, edge].sort());
  });
});
