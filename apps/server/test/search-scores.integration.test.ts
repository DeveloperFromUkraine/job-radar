import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MatchView, SearchDeps } from "../src/modules/search/app/deps.js";
import { nextPage } from "../src/modules/search/app/pages.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { readState } from "../src/modules/search/infra/repo.js";
import { loadContract } from "./helpers/contract.js";
import { fakeScoreReader, notScored, scored } from "./helpers/score-reader.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const contract = loadContract("match-score");
let t: TempDb;
let snapshots: SnapshotStore;
let deps: SearchDeps;

beforeEach(() => {
  t = createTempDb();
  deps = { db: t.db, now: () => Date.UTC(2026, 9, 15, 9) };
  snapshots = createSnapshotStore(deps.now);
  openVisit(deps);
});
afterEach(() => t.cleanup());

function search(order?: "newest" | "best_match") {
  const result = runSearch(deps, snapshots, "", order);
  contract.expectContract("runSearch", 200, result);
  return result;
}
function page(snapshotId: string, cursor: string) {
  const result = nextPage(deps, snapshots, snapshotId, cursor);
  contract.expectContract("getNextPage", 200, result);
  return result;
}
/** ids newest first: seedOpenPostings gives later postings a later first-found time. */
const newestFirst = (ids: string[]) => [...ids].reverse();

describe("best match first (AC-11)", () => {
  it("puts the 20 unscored newest first, then the 110 scored high to low, equal scores newest first, in pages of 50", () => {
    const ids = seedOpenPostings(t.db, 130);
    const newest = newestFirst(ids);
    // 110 scored (5 against an earlier version), 15 pending, 5 could not be scored.
    const matches = new Map<string, MatchView>();
    newest.forEach((id, i) => {
      if (i % 26 === 3) matches.set(id, notScored("could_not_score", "the answers could not be used"));
      else if (i % 26 === 7 || i % 26 === 11 || i % 26 === 15)
        matches.set(id, notScored("pending", "waiting to be scored"));
      else
        matches.set(
          id,
          scored(i % 7 === 0 ? 50 : 100 - (i % 60), i % 40 === 1 ? { stale: "posting_changed" } : {}),
        );
    });
    const unscored = newest.filter((id) => matches.get(id)?.state !== "scored");
    expect(unscored).toHaveLength(20);
    deps.scores = fakeScoreReader(matches);

    const first = search("best_match");
    const all = [
      first.items,
      page(first.snapshot_id, "50").items,
      page(first.snapshot_id, "100").items,
    ].flat();
    expect(first).toMatchObject({ order: "best_match", has_profile: true, total: 130 });
    expect(all.map((p) => p.id)).toHaveLength(130);
    expect(new Set(all.map((p) => p.id)).size).toBe(130);
    expect(all.slice(0, 20).map((p) => p.id)).toEqual(unscored);
    const rest = all.slice(20);
    for (let i = 1; i < rest.length; i++) {
      const a = rest[i - 1]?.match?.total ?? 0;
      const b = rest[i]?.match?.total ?? 0;
      expect(a).toBeGreaterThanOrEqual(b);
      if (a === b)
        expect(newest.indexOf(rest[i - 1]?.id ?? "")).toBeLessThan(newest.indexOf(rest[i]?.id ?? ""));
    }
    expect(rest.some((p) => p.match?.stale === "posting_changed")).toBe(true);
  });

  it("keeps the choice for the next opening, and newest first is the default", () => {
    seedOpenPostings(t.db, 2);
    deps.scores = fakeScoreReader();
    expect(search().order).toBe("newest");
    search("best_match");
    expect(readState(t.db).listOrder).toBe("best_match");
    expect(search().order).toBe("best_match");
    search("newest");
    expect(search().order).toBe("newest");
  });

  it("keeps the order fixed: a score that arrives later shows on its card but does not move it", () => {
    const ids = seedOpenPostings(t.db, 60);
    const newest = newestFirst(ids);
    const matches = new Map<string, MatchView>(newest.map((id, i) => [id, scored(90 - i)]));
    deps.scores = fakeScoreReader(matches);
    const first = search("best_match");
    const last = newest.at(-1) as string;
    matches.set(last, scored(99));
    const second = page(first.snapshot_id, "50").items;
    expect(second.at(-1)?.id).toBe(last);
    expect(second.at(-1)?.match?.total).toBe(99);
  });
});

describe("a score never hides a posting (AC-02)", () => {
  it("lists all 40, 25 of them below 30, with the same counts in either order", () => {
    const ids = seedOpenPostings(t.db, 40);
    deps.scores = fakeScoreReader(new Map(ids.map((id, i) => [id, scored(i < 25 ? 5 + i : 80)])));
    const newestOrder = search("newest");
    const best = search("best_match");
    for (const r of [newestOrder, best]) {
      expect(r.total).toBe(40);
      expect([...r.items].length).toBe(40);
    }
    const counts = (r: typeof best) => [r.total, r.new_count, r.marked_count, r.hidden_count];
    expect(counts(best)).toEqual(counts(newestOrder));
    expect(best.items.filter((p) => (p.match?.total ?? 100) < 30)).toHaveLength(25);
    expect(best.items.every((p) => p.match?.note)).toBe(true);
  });
});

describe("no profile (AC-15)", () => {
  it("works as before: no matches, newest first, has_profile false", () => {
    seedOpenPostings(t.db, 3);
    const r = search("best_match");
    expect(r).toMatchObject({ has_profile: false, order: "newest" });
    expect(r.items.every((p) => p.match === null)).toBe(true);
  });
});

describe("scores that cannot be read (api-sync F-3)", () => {
  it("fail open: newest first, no matches, no error", () => {
    const ids = seedOpenPostings(t.db, 3);
    deps.scores = fakeScoreReader(new Map(), { unreadable: true });
    const r = search("best_match");
    expect(r.items.map((p) => p.id)).toEqual(newestFirst(ids));
    expect(r.items.every((p) => p.match === null)).toBe(true);
    expect(r.order).toBe("newest");
    expect(r.has_profile).toBe(true); // no misleading "set up a profile" line
  });
});

describe("waking the scorer (AC-13)", () => {
  it("tells matching a new list was read on every search, but not on a page", () => {
    seedOpenPostings(t.db, 60);
    const reader = fakeScoreReader();
    deps.scores = reader;
    const r = search();
    expect(reader.listReads).toBe(1);
    page(r.snapshot_id, "50");
    expect(reader.listReads).toBe(1);
  });

  it("in newest order only asks for the page's matches", () => {
    seedOpenPostings(t.db, 120);
    const reader = fakeScoreReader();
    deps.scores = reader;
    search("newest");
    expect(reader.asked.map((a) => a.length)).toEqual([50]);
  });
});
