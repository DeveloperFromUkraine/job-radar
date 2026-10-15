import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setFilterOn, setLook } from "../src/modules/remote-filter/app/settings.js";
import type { MatchView, SearchDeps } from "../src/modules/search/app/deps.js";
import { nextMarkedPage, runMarkedView } from "../src/modules/search/app/marked.js";
import { ownerList } from "../src/modules/search/app/owner-list.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { saveLastSkills } from "../src/modules/search/infra/repo.js";
import { loadContract } from "./helpers/contract.js";
import { setRemoteFilterSettings } from "./helpers/remote-filter-fixtures.js";
import { fakeScoreReader, notScored, scored } from "./helpers/score-reader.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

const contract = loadContract("match-score");
const T0 = Date.UTC(2026, 9, 15, 9);
let t: TempDb;
let deps: SearchDeps;
let snapshots: SnapshotStore;

beforeEach(() => {
  t = createTempDb();
  deps = { db: t.db, now: () => T0 };
  snapshots = createSnapshotStore(deps.now);
  openVisit(deps);
});
afterEach(() => t.cleanup());

/** `n` Go postings at a location, first found at the given times so the order is known. */
const seed = (n: number, location: string | null, from: number, title = "Go engineer") =>
  Array.from({ length: n }, (_, i) =>
    addPosting(t.db, { title, firstFoundAt: from + i, listings: [{ locationRestriction: location }] }),
  );

describe("ownerList (AC-13)", () => {
  it("is exactly the 30 listed postings, newest first: not the 20 hidden, not the 5 marked", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    saveLastSkills(t.db, ["Go"]);
    const listed = seed(30, "Europe", 100);
    seed(20, "USA", 200);
    const marked = seed(5, "Europe", 300);
    seedMarks(t.db, marked, { mark: "applied", markedAt: T0 });
    seed(4, "Europe", 400, "Designer"); // no typed skill matches

    const ids = ownerList(deps).map((p) => p.id);
    expect(ids).toEqual([...listed].reverse());
    // The same postings search lists for the owner, in the same order.
    expect(runSearch(deps, snapshots, "Go").items.map((p) => p.id)).toEqual(ids);
  });

  it("widens when the filter is switched off, or during a one-off look", () => {
    setRemoteFilterSettings(t.db, { country: "PL" });
    seed(3, "Europe", 100);
    const usa = seed(2, "USA", 200);
    expect(ownerList(deps)).toHaveLength(3);
    setFilterOn({ db: t.db, now: deps.now }, false);
    expect(ownerList(deps).map((p) => p.id)).toEqual(expect.arrayContaining(usa));
    setFilterOn({ db: t.db, now: deps.now }, true);
    setLook({ db: t.db, now: deps.now }, "United States");
    expect(ownerList(deps).map((p) => p.id)).toEqual(expect.arrayContaining(usa));
  });

  it("with no skills is every open posting the filter shows (search AC-10)", () => {
    seed(3, "Europe", 100, "Designer");
    expect(ownerList(deps)).toHaveLength(3);
  });

  it("leaves out a posting marked before its turn", () => {
    const [a, b] = seed(2, "Europe", 100);
    seedMarks(t.db, [a as string], { mark: "skipped", markedAt: T0 });
    expect(ownerList(deps).map((p) => p.id)).toEqual([b]);
  });
});

describe("the marked view shows each marked posting's last score (AC-13 note)", () => {
  it("with its stale mark if any, and null when never scored", () => {
    const [scoredId, neverId, failedId] = seed(3, "Europe", 100);
    seedMarks(t.db, [scoredId, neverId, failedId] as string[], { mark: "applied", markedAt: T0 });
    deps.scores = fakeScoreReader(
      new Map<string, MatchView>([
        [scoredId as string, scored(76, { stale: "profile_changed" })],
        [failedId as string, notScored("could_not_score", "the answers could not be used")],
      ]),
    );
    const view = runMarkedView(deps, snapshots, "");
    contract.expectContract("runMarkedView", 200, view);
    const byId = new Map(view.items.map((p) => [p.id, p.match]));
    expect(byId.get(scoredId as string)).toMatchObject({
      state: "scored",
      total: 76,
      stale: "profile_changed",
    });
    expect(byId.get(neverId as string)).toBe(null); // a marked posting is never scored, so never "pending"
    expect(byId.get(failedId as string)).toBe(null);
    const page = nextMarkedPage(deps, snapshots, view.snapshot_id, "0");
    contract.expectContract("getNextMarkedPage", 200, page);
  });

  it("without a profile every marked posting has match null", () => {
    const ids = seed(2, "Europe", 100);
    seedMarks(t.db, ids, { mark: "skipped", markedAt: T0 });
    const view = runMarkedView(deps, snapshots, "");
    contract.expectContract("runMarkedView", 200, view);
    expect(view.items.every((p) => p.match === null)).toBe(true);
  });
});
