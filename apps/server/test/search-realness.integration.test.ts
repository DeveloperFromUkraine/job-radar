import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { updateState } from "../src/modules/collector/infra/repo/state.js";
import { setOn } from "../src/modules/realness/app/settings.js";
import type { MatchView, SearchDeps } from "../src/modules/search/app/deps.js";
import { nextPage } from "../src/modules/search/app/pages.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { loadContract } from "./helpers/contract.js";
import { fakeScoreReader, notScored, scored } from "./helpers/score-reader.js";
import { addPosting, type PostingSeed } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

// realness-score T10: search assesses at snapshot build, orders by penalty, presents realness (AC-01,
// AC-02, AC-04, AC-05, AC-09, AC-10; ADR-0002, ADR-0003).
const contract = loadContract("realness-score");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 16, 10);
const PAID = { payField: "USD 60000–80000" };

let t: TempDb;
let snapshots: SnapshotStore;
let deps: SearchDeps;
let warned: object[];

beforeEach(() => {
  t = createTempDb();
  warned = [];
  deps = {
    db: t.db,
    now: () => NOW,
    log: { info: () => {}, warn: (o) => warned.push(o) },
  };
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
// Newest first by first-found time: `at` days ago.
const add = (id: string, at: number, seed: PostingSeed = {}) =>
  addPosting(t.db, { id, firstFoundAt: NOW - at * DAY, listings: [PAID], ...seed });
const withScores = (totals: Record<string, number | null>) => {
  const m = new Map<string, MatchView>();
  for (const [id, total] of Object.entries(totals))
    m.set(id, total === null ? notScored("pending", "waiting to be scored") : scored(total));
  deps.scores = fakeScoreReader(m);
};
const ids = (r: { items: { id: string }[] }) => r.items.map((p) => p.id);

describe("best match first with realness (AC-01)", () => {
  beforeEach(() => {
    add("00000000-0000-7000-8000-00000000000a", 1); // A 88, no signals
    add("00000000-0000-7000-8000-00000000000b", 2, {
      publishedAt: NOW - 65 * DAY,
      listings: [{ payField: "" }],
    }); // B 92 − 25
    add("00000000-0000-7000-8000-00000000000c", 3); // C 70
    withScores({
      "00000000-0000-7000-8000-00000000000a": 88,
      "00000000-0000-7000-8000-00000000000b": 92,
      "00000000-0000-7000-8000-00000000000c": 70,
    });
  });

  it("orders A, C, B and keeps each card's own score", () => {
    const r = search("best_match");
    expect(r.realness_on).toBe(true);
    expect(ids(r)).toEqual([
      "00000000-0000-7000-8000-00000000000a",
      "00000000-0000-7000-8000-00000000000c",
      "00000000-0000-7000-8000-00000000000b",
    ]);
    expect(r.items.map((p) => p.match?.total)).toEqual([88, 70, 92]);
    expect(r.items.map((p) => p.realness)).toEqual([
      null,
      null,
      { penalty: 25, signals: [{ kind: "age", basis: "posted", days: 65 }, { kind: "no_salary" }] },
    ]);
  });

  it("with realness off orders by score alone and shows no realness (AC-10)", () => {
    setOn({ db: t.db }, false);
    const r = search("best_match");
    expect(r.realness_on).toBe(false);
    expect(ids(r)[0]).toBe("00000000-0000-7000-8000-00000000000b");
    expect(r.items.every((p) => p.realness === null)).toBe(true);
  });

  it("newest first is untouched, and still names the signals (AC-04)", () => {
    // B is lowered and would lead the best-match order with realness off; newest first ignores both.
    const on = search("newest");
    setOn({ db: t.db }, false);
    const off = search("newest");
    expect(ids(on)).toEqual(ids(off));
    expect(ids(on)).toEqual([
      "00000000-0000-7000-8000-00000000000a",
      "00000000-0000-7000-8000-00000000000c",
      "00000000-0000-7000-8000-00000000000b", // posted 65 days ago
    ]);
    expect(on.items[2]?.realness?.penalty).toBe(25);
  });

  it("fails open: realness that cannot be read builds the plain list and warns", () => {
    deps.realness = {
      assess: () => {
        throw new Error("disk");
      },
      isOn: () => true,
      noteListShown: () => {},
    };
    const r = search("best_match");
    expect(ids(r)[0]).toBe("00000000-0000-7000-8000-00000000000b");
    expect(r.items.every((p) => p.realness === null)).toBe(true);
    expect(r.realness_on).toBe(true);
    expect(warned).toContainEqual(expect.objectContaining({ module: "search" }));
  });

  it("fails open with the saved switch and keeps no day's share from an unread list (review F-03, F-04)", () => {
    const noted: unknown[] = [];
    deps.realness = {
      assess: () => {
        throw new Error("disk");
      },
      isOn: () => false,
      noteListShown: (...args) => {
        noted.push(args);
      },
    };
    expect(search("best_match").realness_on).toBe(false);
    expect(noted).toEqual([]);
  });

  it("an unreadable switch alone still presents realness, as on (contract: true if never read)", () => {
    add("00000000-0000-7000-8000-000000000001", 1);
    deps.realness = {
      assess: (postings) =>
        new Map(postings.map((p) => [p.id, { penalty: 10, signals: [{ kind: "no_salary" as const }] }])),
      isOn: () => {
        throw new Error("disk");
      },
      noteListShown: () => {},
    };
    const r = search("best_match");
    expect(r.realness_on).toBe(true);
    expect(r.items[0]?.realness?.signals).toEqual([{ kind: "no_salary" }]);
  });
});

describe("the unscored block (AC-05, ADR-0003)", () => {
  it("no-signal postings first newest first, then by penalty; best match is kept without a profile", () => {
    add("00000000-0000-7000-8000-000000000001", 1);
    add("00000000-0000-7000-8000-000000000002", 2, { listings: [{ payField: "" }] }); // 5
    add("00000000-0000-7000-8000-000000000003", 3);
    add("00000000-0000-7000-8000-000000000004", 40, { listings: [{ payField: "" }] }); // 15
    add("00000000-0000-7000-8000-000000000005", 4, { listings: [{ payField: "" }] }); // 5
    deps.scores = fakeScoreReader(new Map(), { hasProfile: false });
    const r = search("best_match");
    expect(r).toMatchObject({ order: "best_match", has_profile: false });
    expect(ids(r).map((id) => id.slice(-1))).toEqual(["1", "3", "2", "5", "4"]);
  });

  it("stays best match first when scores cannot be read", () => {
    add("00000000-0000-7000-8000-000000000001", 1, { listings: [{ payField: "" }] });
    add("00000000-0000-7000-8000-000000000002", 2);
    deps.scores = fakeScoreReader(new Map(), { unreadable: true });
    const r = search("best_match");
    expect(r.order).toBe("best_match");
    expect(ids(r).map((id) => id.slice(-1))).toEqual(["2", "1"]);
  });

  it("pending scores are unscored and ordered by penalty too", () => {
    add("00000000-0000-7000-8000-000000000001", 1, { listings: [{ payField: "" }] });
    add("00000000-0000-7000-8000-000000000002", 2);
    add("00000000-0000-7000-8000-000000000003", 3);
    withScores({
      "00000000-0000-7000-8000-000000000001": null,
      "00000000-0000-7000-8000-000000000002": null,
      "00000000-0000-7000-8000-000000000003": 90,
    });
    expect(ids(search("best_match")).map((id) => id.slice(-1))).toEqual(["2", "1", "3"]);
  });
});

describe("paging and reloads", () => {
  it("next pages carry the realness kept in the snapshot (ADR-0002)", () => {
    for (let i = 0; i < 60; i++)
      add(`00000000-0000-7000-8000-${String(i).padStart(12, "0")}`, i, { listings: [{ payField: "" }] });
    const first = search("newest");
    t.db.run(sql`update collector_listings set pay_field = 'USD 100000'`);
    const next = page(first.snapshot_id, "50");
    expect(next.items).toHaveLength(10);
    expect(next.items.every((p) => p.realness?.signals.some((s) => s.kind === "no_salary"))).toBe(true);
  });

  it("a source disabled between loads changes the board count on the next load (AC-09)", () => {
    add("00000000-0000-7000-8000-000000000001", 50, {
      listings: ["jobicy", "remotive", "himalayas", "weworkremotely"].map((sourceId) => ({
        sourceId,
        ...PAID,
      })),
    });
    expect(search("newest").items[0]?.realness?.signals).toEqual([
      { kind: "many_boards", boards: 4, days: 50 },
    ]);
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.sources.himalayas.enabled = false;
    updateState(t.db, { lastValidSettings: JSON.stringify(settings), lastValidSettingsAt: NOW });
    expect(search("newest").items[0]?.realness?.signals).toEqual([
      { kind: "many_boards", boards: 3, days: 50 },
    ]);
  });

  it("keeps the day's share from the owner's list", () => {
    add("00000000-0000-7000-8000-000000000001", 1);
    add("00000000-0000-7000-8000-000000000002", 2, { listings: [{ payField: "" }] });
    search("newest");
    expect(t.db.all(sql`select postings, lowered from realness_daily_shares`)).toEqual([
      { postings: 2, lowered: 1 },
    ]);
  });
});

// Review F-08: the Test plan rows that had no test of their own.
describe("signals on the next list load (AC-07, AC-08, AC-09, AC-14)", () => {
  const A = "00000000-0000-7000-8000-0000000000a1";
  const B = "00000000-0000-7000-8000-0000000000b1";
  const addListing = (postingId: string, sourceId: string, payField: string | null = null) => {
    db(sql`insert or ignore into collector_sources (id, fill_status) values (${sourceId}, 'complete')`);
    db(
      sql`insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company, description,
            location_restriction, categories, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status, pay_field)
          values (${`${postingId}-${sourceId}`}, ${postingId}, ${sourceId}, ${sourceId}, ${`https://jobs.example.test/${sourceId}`},
            'Software Engineer', 'Example Co', 'A role.', 'Worldwide', '[]', ${NOW}, 0, 1, 'r1', 'open', ${payField})`,
    );
  };
  const db = (q: ReturnType<typeof sql>) => t.db.run(q);
  const signals = (id: string) => search("newest").items.find((p) => p.id === id)?.realness?.signals;

  it("a reopened posting keeps its ordering time and age, and gains the repost signal (AC-07)", () => {
    add(A, 40, { reopenedAt: NOW - DAY });
    add(B, 35);
    const r = search("newest");
    expect(ids(r)).toEqual([B, A]);
    expect(r.items[1]?.realness?.signals).toEqual([
      { kind: "age", basis: "first_found", days: 40 },
      { kind: "repost" },
    ]);
  });

  it("a closed, applied look-alike more than 7 days earlier: the repost signal and the look-alike hint (AC-08)", () => {
    const head = { company: "Acme", title: "Senior Go Engineer" };
    const old = add(A, 30, { ...head, status: "closed", listings: [{ ...PAID, status: "closed" }] });
    seedMarks(t.db, [old], { mark: "applied", markedAt: NOW - 29 * DAY });
    add(B, 2, head);
    const item = search("newest").items.find((p) => p.id === B);
    expect(item?.realness?.signals).toEqual([{ kind: "repost" }]);
    expect(item?.look_alike).toMatchObject({ mark: "applied", company: "Acme" });
  });

  it("new pay text and new listings change the signals on the next load (AC-09)", () => {
    add(A, 50, { listings: [{ payField: "" }] });
    expect(signals(A)).toEqual([{ kind: "age", basis: "first_found", days: 50 }, { kind: "no_salary" }]);
    db(sql`update collector_listings set pay_field = 'USD 60000–80000' where posting_id = ${A}`);
    expect(signals(A)).toEqual([{ kind: "age", basis: "first_found", days: 50 }]);
    addListing(A, "remotive", "$100k");
    addListing(A, "himalayas", "USD 90000");
    expect(signals(A)).toEqual([{ kind: "many_boards", boards: 3, days: 50 }]);
  });

  it("keeps the day's share with the switch off too (AC-14)", () => {
    add(A, 1);
    add(B, 2, { listings: [{ payField: "" }] });
    setOn({ db: t.db }, false);
    expect(search("newest").realness_on).toBe(false);
    expect(t.db.all(sql`select postings, lowered from realness_daily_shares`)).toEqual([
      { postings: 2, lowered: 1 },
    ]);
  });
});
