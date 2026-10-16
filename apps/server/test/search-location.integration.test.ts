import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/core/errors.js";
import { setFilterOn, setLook } from "../src/modules/remote-filter/app/settings.js";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { runMarkedView } from "../src/modules/search/app/marked.js";
import { nextPage } from "../src/modules/search/app/pages.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { waitingCount } from "../src/modules/search/app/waiting.js";
import { loadContract } from "./helpers/contract.js";
import { setRemoteFilterSettings } from "./helpers/remote-filter-fixtures.js";
import { addPosting, seedOpenPostings, setSearchState } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

const contract = loadContract("remote-filter");
// runSearch and getNextPage as restated by match-score (it supersedes remote-filter's).
const listContract = loadContract("match-score");
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 14, 9);
const PL = { code: "PL", name: "Poland", flag: "🇵🇱" };
const DE = { code: "DE", name: "Germany", flag: "🇩🇪" };

let t: TempDb;
let now: number;
let deps: SearchDeps;
let snapshots: SnapshotStore;
let logged: object[];

beforeEach(() => {
  t = createTempDb();
  now = T0;
  logged = [];
  deps = { db: t.db, now: () => now, log: { info: (obj) => logged.push(obj) } };
  snapshots = createSnapshotStore(deps.now);
  openVisit(deps);
});
afterEach(() => t.cleanup());

const rf = () => ({ db: t.db, now: () => now });
function search(skills = "") {
  const result = runSearch(deps, snapshots, skills);
  listContract.expectContract("runSearch", 200, result);
  return result;
}
const posting = (locationRestriction: string | null, over: Parameters<typeof addPosting>[1] = {}) =>
  addPosting(t.db, { title: "Go engineer", listings: [{ locationRestriction }], ...over });

describe("search with the location filter", () => {
  it("shows what fits Poland, hides USA and LATAM, keeps every statement as stated (AC-01)", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    const shown = ["EMEA", "Europe", "Poland", "🇵🇱 Poland, 🇺🇦 Ukraine", "Worldwide", "UTC-1 to UTC+3"];
    const ids = new Map([...shown, "USA", "LATAM"].map((s, i) => [posting(s, { firstFoundAt: 100 - i }), s]));
    const result = search();
    expect(result.items.map((p) => ids.get(p.id))).toEqual(shown);
    expect(result.items.map((p) => p.listings[0]?.location_restriction)).toEqual(shown);
    expect(result.items.every((p) => p.location_check === null)).toBe(true);
    expect(result).toMatchObject({
      total: 6,
      hidden_count: 2,
      location_filter: { mode: "own", country: PL },
    });
  });

  it("keeps uncertain postings with one reason each (AC-02)", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    const cases: Array<[string | null, string]> = [
      [null, "not_stated"],
      ["Helsinki", "not_recognised"],
      ["Worldwide except Poland", "exception"],
      ["United States, UTC-10 to UTC+14", "hours_only"],
    ];
    const ids = new Map(cases.map(([s, reason], i) => [posting(s, { firstFoundAt: 10 - i }), reason]));
    const result = search();
    expect(result.items.map((p) => [p.location_check, ids.get(p.id)])).toEqual(
      cases.map(([, reason]) => [reason, reason]),
    );
    expect(result.hidden_count).toBe(0);
  });

  it("counts 102 shown of 140, 38 hidden; off shows all 140 with no checks (AC-07)", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    seedOpenPostings(t.db, 140, (i) => ({
      title: "Go engineer",
      listings: [{ locationRestriction: i < 102 ? "Europe" : "USA" }],
    }));
    const on = search("Go");
    expect(on).toMatchObject({ total: 102, hidden_count: 38, has_next: true });
    const pages = [on.items];
    let cursor = on.next_cursor;
    while (cursor) {
      const page = nextPage(deps, snapshots, on.snapshot_id, cursor);
      listContract.expectContract("getNextPage", 200, page);
      pages.push(page.items);
      cursor = page.next_cursor;
    }
    expect(pages.flat()).toHaveLength(102);

    setFilterOn(rf(), false);
    const off = search("Go");
    expect(off).toMatchObject({ total: 140, hidden_count: 0, location_filter: { mode: "off", country: PL } });
    expect(off.items.every((p) => p.location_check === null)).toBe(true);
  });

  it("says the filter hid all 12 when nothing is left (AC-08)", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    for (let i = 0; i < 12; i++) posting("USA");
    expect(search("Go")).toMatchObject({ total: 0, hidden_count: 12, items: [], collection_empty: false });
  });

  it("reports hidden postings even when marks and the filter together empty the list (AC-08 note)", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    const marked = posting("Europe");
    seedMarks(t.db, [marked], { mark: "skipped" });
    posting("USA");
    expect(search("Go")).toMatchObject({ total: 0, marked_count: 1, hidden_count: 1 });
  });

  describe("new and waiting (AC-09)", () => {
    it("waits for 2 of 5 added, shows those 2 as new after a refresh", () => {
      setRemoteFilterSettings(t.db, { country: "PL" });
      posting("Europe", { firstFoundAt: T0 - 60 * MIN });
      const first = search("Go");
      for (const s of ["Europe", "Worldwide", "USA", "USA", "LATAM"]) posting(s, { firstFoundAt: T0 + MIN });
      now = T0 + 2 * MIN;
      const waiting = waitingCount(deps, snapshots, first.snapshot_id);
      contract.expectContract("getWaitingCount", 200, waiting);
      expect(waiting).toEqual({ waiting_count: 2 });

      // A later visit: what was added since the previous visit's start is new.
      setSearchState(t.db, { previousVisitStartedAt: T0 });
      const refreshed = search("Go");
      expect(refreshed).toMatchObject({ total: 3, new_count: 2, hidden_count: 3 });
      expect(refreshed.items.filter((p) => p.is_new)).toHaveLength(2);
    });

    it("a hidden posting new since the previous visit is new once the filter is off", () => {
      setRemoteFilterSettings(t.db, { country: "PL" });
      setSearchState(t.db, { previousVisitStartedAt: T0 - 60 * MIN });
      posting("USA", { firstFoundAt: T0 - MIN });
      expect(search("Go")).toMatchObject({ total: 0, new_count: 0, hidden_count: 1 });
      setFilterOn(rf(), false);
      const off = search("Go");
      expect(off).toMatchObject({ total: 1, new_count: 1 });
      expect(off.items[0]?.is_new).toBe(true);
    });
  });

  describe("a one-off look (AC-06)", () => {
    it("filters for Germany, then back to Poland", () => {
      setRemoteFilterSettings(t.db, { country: "PL" });
      const germany = posting("Germany");
      const poland = posting("Poland");
      setLook(rf(), "Germany");
      const look = search("Go");
      expect(look).toMatchObject({ location_filter: { mode: "look", country: DE }, hidden_count: 1 });
      expect(look.items.map((p) => p.id)).toEqual([germany]);
      setLook(rf(), null);
      expect(search("Go").items.map((p) => p.id)).toEqual([poland]);
    });

    it("a look from an earlier visit is gone in a new visit", () => {
      setRemoteFilterSettings(t.db, { country: "PL" });
      setLook(rf(), "Germany");
      now = T0 + 45 * MIN;
      openVisit(deps);
      expect(search("Go").location_filter).toEqual({ mode: "own", country: PL });
    });

    it("works without a country; ending it is the unfiltered list again", () => {
      posting("USA");
      setLook(rf(), "Germany");
      expect(search("Go")).toMatchObject({ total: 0, hidden_count: 1, location_filter: { mode: "look" } });
      setLook(rf(), null);
      expect(search("Go")).toMatchObject({
        total: 1,
        hidden_count: 0,
        location_filter: { mode: "none", country: null },
      });
    });
  });

  it("with no country chosen lists everything, unmarked (AC-04)", () => {
    posting("USA");
    posting(null);
    const result = search("Go");
    expect(result).toMatchObject({
      total: 2,
      hidden_count: 0,
      location_filter: { mode: "none", country: null },
    });
    expect(result.items.every((p) => p.location_check === null)).toBe(true);
  });

  it("hides a look-alike stating USA with no hint, and the marked view is unchanged (AC-11)", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    const applied = posting("USA", { company: "Acme", title: "Go engineer" });
    seedMarks(t.db, [applied], { mark: "applied" });
    const lookAlike = posting("USA", { company: "Acme", title: "Go engineer" });
    const fitting = posting("Europe", { company: "Acme", title: "Go engineer" });
    const result = search("Go");
    expect(result.items.map((p) => p.id)).toEqual([fitting]);
    expect(result.items[0]?.look_alike).not.toBeNull();
    expect(result.items.map((p) => p.id)).not.toContain(lookAlike);
    expect(result.marked_count).toBe(1);

    const marked = runMarkedView(deps, snapshots, "Go");
    expect(marked.items.map((p) => p.id)).toEqual([applied]);
  });

  it("answers 503 when the location settings cannot be read", () => {
    deps.location = {
      activeFilter: () => {
        throw new Error("disk I/O error");
      },
      verdictsFor: () => new Map(),
    };
    posting("Europe");
    try {
      runSearch(deps, snapshots, "Go");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e).toMatchObject({ code: "SEARCH_COLLECTION_UNAVAILABLE", statusCode: 503 });
    }
  });

  it("logs hidden and checked counts and the country, never the statements", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    posting("USA");
    posting("Helsinki");
    search("Go");
    expect(logged.at(-1)).toMatchObject({ hidden: 1, checked: 1, country: "PL" });
    expect(JSON.stringify(logged)).not.toContain("Helsinki");
  });
});
