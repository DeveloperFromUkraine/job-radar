import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.js";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { nextPage } from "../src/modules/search/app/pages.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { waitingCount } from "../src/modules/search/app/waiting.js";
import { readState } from "../src/modules/search/infra/repo.js";
import { addPosting, seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

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

function caught(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("expected an AppError");
}

const close = (id: string) => t.db.run(sql`update collector_postings set status = 'closed' where id = ${id}`);

describe("nextPage (AC-15)", () => {
  it("serves 130 results as 50 / 100 / 130 in one-long-list order", () => {
    seedOpenPostings(t.db, 130, (i) => ({ title: i % 2 ? "Go engineer" : "React engineer" }));
    const first = runSearch(deps, snapshots, "");
    const oneLongList = snapshots.get(first.snapshot_id)?.ids;
    expect(first).toMatchObject({ total: 130, next_cursor: "50" });

    const second = nextPage(deps, snapshots, first.snapshot_id, "50");
    expect(second).toMatchObject({ has_next: true, next_cursor: "100" });
    const third = nextPage(deps, snapshots, first.snapshot_id, "100");
    expect(third).toMatchObject({ has_next: false, next_cursor: null });

    const shown = [...first.items, ...second.items, ...third.items].map((p) => p.id);
    expect(shown).toHaveLength(130);
    expect(shown).toEqual(oneLongList);
  });

  it("keeps the snapshot's matched skills and new marks on later pages", () => {
    seedOpenPostings(t.db, 60, () => ({ title: "React engineer" }));
    const first = runSearch(deps, snapshots, "react");
    const page = nextPage(deps, snapshots, first.snapshot_id, "50");
    expect(page.items).toHaveLength(10);
    expect(page.items[0]?.matched_skills).toEqual([{ skill: "react", in_title: true }]);
  });

  it("returns an empty last page for a cursor beyond the end", () => {
    seedOpenPostings(t.db, 3);
    const first = runSearch(deps, snapshots, "");
    expect(nextPage(deps, snapshots, first.snapshot_id, "50")).toEqual({
      items: [],
      has_next: false,
      next_cursor: null,
    });
  });

  it("answers 410 for an unknown or evicted snapshot", () => {
    const err = caught(() => nextPage(deps, snapshots, "01926a3b-1c2d-7e4f-8a00-0000000000a1", "50"));
    expect([err.statusCode, err.code, err.message]).toEqual([
      410,
      "SEARCH_SNAPSHOT_EXPIRED",
      "This list has expired; it was reloaded from the newest.",
    ]);
  });

  it("answers 503 when the collection cannot be read, and the retry returns the same page", () => {
    seedOpenPostings(t.db, 70);
    const first = runSearch(deps, snapshots, "");
    const real = deps.collection;
    deps.collection = {
      open: () => [],
      byIds: () => {
        throw new Error("SQLITE_BUSY");
      },
    };
    const err = caught(() => nextPage(deps, snapshots, first.snapshot_id, "50"));
    expect([err.statusCode, err.code]).toEqual([503, "SEARCH_COLLECTION_UNAVAILABLE"]);
    deps.collection = real;
    const retry = nextPage(deps, snapshots, first.snapshot_id, "50");
    expect(retry.items.map((p) => p.id)).toEqual(snapshots.get(first.snapshot_id)?.ids.slice(50));
  });
});

describe("paging while collection runs (AC-16)", () => {
  it("never repeats or shifts, leaves out closed postings, and counts matching additions as waiting", () => {
    const ids = seedOpenPostings(t.db, 120, () => ({ title: "Go engineer", firstFoundAt: 500 }));
    const first = runSearch(deps, snapshots, "Go");
    const order = snapshots.get(first.snapshot_id)?.ids ?? [];

    // A collection run after loading: closes one posting on page 2, moves another's time earlier
    // (a merge), and adds three postings, two of them matching.
    clock += 60_000;
    const closedId = order[60] as string;
    close(closedId);
    t.db.run(sql`update collector_postings set published_at = 1 where id = ${order[70] as string}`);
    addPosting(t.db, { title: "Go lead", firstFoundAt: clock });
    addPosting(t.db, { title: "Go architect", firstFoundAt: clock });
    addPosting(t.db, { title: "Rust lead", firstFoundAt: clock });

    const second = nextPage(deps, snapshots, first.snapshot_id, "50");
    const third = nextPage(deps, snapshots, first.snapshot_id, "100");
    const shown = [...first.items, ...second.items, ...third.items].map((p) => p.id);

    expect(new Set(shown).size).toBe(shown.length);
    expect(shown).toEqual(order.filter((id) => id !== closedId));
    expect(shown).toHaveLength(ids.length - 1);
    expect(waitingCount(deps, snapshots, first.snapshot_id)).toEqual({ waiting_count: 2 });
  });

  it("keeps a still-open posting whose text no longer matches (no skip)", () => {
    seedOpenPostings(t.db, 60, () => ({ title: "Go engineer", firstFoundAt: 500 }));
    const first = runSearch(deps, snapshots, "Go");
    const order = snapshots.get(first.snapshot_id)?.ids ?? [];
    // After loading, an update-known rewrites one page-2 posting's text so it no longer mentions Go.
    const changed = order[55] as string;
    t.db.run(
      sql`update collector_listings set title = 'Rust engineer', description = 'Rust' where posting_id = ${changed}`,
    );

    const second = nextPage(deps, snapshots, first.snapshot_id, "50");
    expect(second.items.map((p) => p.id)).toEqual(order.slice(50));
    expect(second.items.find((p) => p.id === changed)?.matched_skills).toEqual([]);
  });

  it("counts every addition for the feed", () => {
    seedOpenPostings(t.db, 2, () => ({ firstFoundAt: 500 }));
    const first = runSearch(deps, snapshots, "");
    expect(waitingCount(deps, snapshots, first.snapshot_id)).toEqual({ waiting_count: 0 });
    clock += 1;
    addPosting(t.db, { firstFoundAt: clock });
    expect(waitingCount(deps, snapshots, first.snapshot_id)).toEqual({ waiting_count: 1 });
  });
});

describe("waitingCount", () => {
  it("refreshes the visit's last seen", () => {
    const first = runSearch(deps, snapshots, "");
    clock += 60_000;
    waitingCount(deps, snapshots, first.snapshot_id);
    expect(readState(t.db).visitLastSeenAt).toBe(clock);
  });

  it("refreshes the visit's last seen even when the snapshot is unknown (410)", () => {
    runSearch(deps, snapshots, "");
    clock += 60_000;
    expect(caught(() => waitingCount(deps, snapshots, "nope")).statusCode).toBe(410);
    expect(readState(t.db).visitLastSeenAt).toBe(clock);
  });

  it("answers 410 for an unknown snapshot and 503 when the collection cannot be read", () => {
    expect(caught(() => waitingCount(deps, snapshots, "nope")).statusCode).toBe(410);
    const first = runSearch(deps, snapshots, "");
    deps.collection = {
      open: () => {
        throw new Error("SQLITE_BUSY");
      },
      byIds: () => [],
    };
    expect(caught(() => waitingCount(deps, snapshots, first.snapshot_id)).statusCode).toBe(503);
  });
});
