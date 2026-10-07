import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.js";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { nextPage } from "../src/modules/search/app/pages.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { waitingCount } from "../src/modules/search/app/waiting.js";
import { addPosting, seedOpenPostings, setSearchState } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

let t: TempDb;
let deps: SearchDeps;
let snapshots: SnapshotStore;
let clock: number;

beforeEach(() => {
  t = createTempDb();
  clock = 1_000_000;
  deps = { db: t.db, now: () => clock };
  snapshots = createSnapshotStore(deps.now);
});
afterEach(() => t.cleanup());

const mark = (ids: readonly string[], m: "applied" | "skipped" | null = "skipped") =>
  seedMarks(t.db, ids, { mark: m });
const unmark = (id: string) => t.db.run(sql`update tracking_marks set mark = null where posting_id = ${id}`);
const order = (snapshotId: string) => snapshots.get(snapshotId)?.ids ?? [];

function caught(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("expected an AppError");
}

describe("the main list leaves marked postings out (AC-01, AC-08, AC-12)", () => {
  it("keeps marked matches in the snapshot but not on the page or in the counts", () => {
    const ids = seedOpenPostings(t.db, 120);
    const probe = runSearch(deps, snapshots, "");
    const inOrder = order(probe.snapshot_id);
    const marked = [inOrder[0], inOrder[3], inOrder[70]] as string[];
    mark(marked);

    const first = runSearch(deps, snapshots, "");
    expect(order(first.snapshot_id)).toEqual(inOrder); // marked matches stay in the snapshot
    expect(first).toMatchObject({ total: 117, marked_count: 3, has_next: true });
    expect(first.items).toHaveLength(50);
    expect(first.items.map((p) => p.id)).toEqual(inOrder.filter((id) => !marked.includes(id)).slice(0, 50));
    expect(ids).toHaveLength(120);
  });

  it("counts only unmarked postings as new", () => {
    setSearchState(t.db, { previousVisitStartedAt: 1_500_000 });
    seedOpenPostings(t.db, 3, () => ({ firstFoundAt: 2_000_000 })); // all new: after the previous visit
    const [a] = order(runSearch(deps, snapshots, "").snapshot_id);
    mark([a as string]);
    expect(runSearch(deps, snapshots, "")).toMatchObject({ total: 2, new_count: 2, marked_count: 1 });
  });

  it("walks later pages past postings marked since loading, includes those cleared since, skips none", () => {
    seedOpenPostings(t.db, 150);
    const probe = runSearch(deps, snapshots, "");
    const inOrder = order(probe.snapshot_id);
    const markedBefore = inOrder[60] as string;
    mark([markedBefore]);

    const first = runSearch(deps, snapshots, "");
    // Since loading: one on the next page is marked, the earlier mark is cleared.
    const markedSince = inOrder[55] as string;
    mark([markedSince]);
    unmark(markedBefore);

    const shown = first.items.map((p) => p.id);
    let cursor = first.next_cursor;
    while (cursor) {
      const page = nextPage(deps, snapshots, first.snapshot_id, cursor);
      shown.push(...page.items.map((p) => p.id));
      cursor = page.next_cursor;
    }
    expect(shown).toEqual(inOrder.filter((id) => id !== markedSince));
  });

  it("returns 50 unmarked postings per page however many marked ones it walks past", () => {
    seedOpenPostings(t.db, 200);
    const inOrder = order(runSearch(deps, snapshots, "").snapshot_id);
    mark(inOrder.slice(50, 130)); // the whole second page and more
    const first = runSearch(deps, snapshots, "");
    const second = nextPage(deps, snapshots, first.snapshot_id, first.next_cursor as string);
    expect(second.items.map((p) => p.id)).toEqual(inOrder.slice(130, 180));
    expect(second.has_next).toBe(true);
  });

  it("has no next page when only marked postings remain", () => {
    seedOpenPostings(t.db, 60);
    const inOrder = order(runSearch(deps, snapshots, "").snapshot_id);
    mark(inOrder.slice(50));
    expect(runSearch(deps, snapshots, "")).toMatchObject({ total: 50, has_next: false, next_cursor: null });
  });
});

describe("nothing left to review (AC-13)", () => {
  it("answers an empty page with the marked-match count when every match is marked", () => {
    const ids = seedOpenPostings(t.db, 3, () => ({ title: "Haskell engineer" }));
    seedOpenPostings(t.db, 2, () => ({ title: "Go engineer" }));
    mark(ids);
    expect(runSearch(deps, snapshots, "Haskell")).toMatchObject({
      total: 0,
      new_count: 0,
      marked_count: 3,
      collection_empty: false,
      items: [],
      has_next: false,
      next_cursor: null,
    });
  });

  it("keeps marked_count at 0 when nothing matches at all", () => {
    seedOpenPostings(t.db, 2, () => ({ title: "Go engineer" }));
    expect(runSearch(deps, snapshots, "Haskell")).toMatchObject({ total: 0, marked_count: 0 });
  });
});

describe("waiting count (AC-12)", () => {
  it("counts only unmarked postings collected after loading", () => {
    seedOpenPostings(t.db, 2);
    const first = runSearch(deps, snapshots, "");
    clock += 1000;
    const added = seedOpenPostings(t.db, 3, () => ({ firstFoundAt: clock }));
    mark([added[0] as string]);
    expect(waitingCount(deps, snapshots, first.snapshot_id)).toEqual({ waiting_count: 2 });
  });
});

describe("look-alike hints (AC-10, AC-11)", () => {
  it("hints a re-post with the earlier applied mark and keeps it in the list and counts", () => {
    const old = addPosting(t.db, {
      company: "Acme Inc",
      title: "Sr. Backend Engineer (Go) – Remote",
      status: "closed",
      listings: [{ status: "closed" }],
    });
    seedMarks(t.db, [old], { mark: "applied", markedAt: Date.UTC(2026, 9, 3, 14) });
    const repost = addPosting(t.db, { company: "ACME", title: "Senior Backend Engineer" });
    const other = addPosting(t.db, { company: "Acme Inc", title: "Frontend Engineer" });

    const result = runSearch(deps, snapshots, "");
    expect(result.total).toBe(2);
    const byId = new Map(result.items.map((p) => [p.id, p]));
    expect(byId.get(repost)?.look_alike).toEqual({
      mark: "applied",
      marked_at: "2026-10-03T14:00:00.000Z",
      company: "Acme Inc",
    });
    expect(byId.get(other)?.look_alike).toBeNull();
  });
});

describe("marks that cannot be read", () => {
  it("answers 503 rather than a list that could show decided postings", () => {
    seedOpenPostings(t.db, 2);
    const failing: SearchDeps = {
      ...deps,
      marks: {
        markedIds: () => {
          throw new Error("disk I/O error");
        },
        hintsFor: () => new Map(),
      },
    };
    const err = caught(() => runSearch(failing, snapshots, ""));
    expect([err.statusCode, err.code]).toEqual([503, "SEARCH_COLLECTION_UNAVAILABLE"]);
  });
});
