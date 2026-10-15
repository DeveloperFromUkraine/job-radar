import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { nextMarkedPage, runMarkedView } from "../src/modules/search/app/marked.js";
import { createSnapshotStore, type SnapshotStore } from "../src/modules/search/app/snapshots.js";
import { readState } from "../src/modules/search/infra/repo.js";
import { loadContract } from "./helpers/contract.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

const contract = loadContract("applied-skipped");
// The marked view as restated by match-score (each posting carries its last score).
const scoredContract = loadContract("match-score");

describe("marked view (AC-05, AC-06)", () => {
  let t: TempDb;
  let deps: SearchDeps;
  let snapshots: SnapshotStore;
  beforeEach(() => {
    t = createTempDb();
    deps = { db: t.db, now: () => 1_000_000 };
    snapshots = createSnapshotStore(deps.now);
  });
  afterEach(() => t.cleanup());

  const closed = { status: "closed" as const, listings: [{ status: "closed" as const }] };

  it("lists marked postings newest first, closed ones and cleared closed ones included", () => {
    const applied = addPosting(t.db, { title: "Go engineer" });
    const closedSkip = addPosting(t.db, { title: "Go developer", ...closed });
    const clearedClosed = addPosting(t.db, { title: "Go lead", ...closed });
    const clearedOpen = addPosting(t.db, { title: "Go architect" });
    addPosting(t.db, { title: "Go unmarked" });
    seedMarks(t.db, [applied], { mark: "applied", markedAt: 10 });
    seedMarks(t.db, [closedSkip], { mark: "skipped", markedAt: 30 });
    seedMarks(t.db, [clearedClosed], { mark: null, markedAt: 20 });
    seedMarks(t.db, [clearedOpen], { mark: null, markedAt: 40 });

    const view = runMarkedView(deps, snapshots, "");
    expect(view).toMatchObject({ marked_count: 2, cleared_count: 1, has_next: false, next_cursor: null });
    expect(view.items.map((p) => [p.id, p.status, p.mark_state.mark])).toEqual([
      [closedSkip, "closed", "skipped"],
      [clearedClosed, "closed", null],
      [applied, "open", "applied"],
    ]);
  });

  it("names every source of a closed posting, linking none", () => {
    const p = addPosting(t.db, {
      status: "closed",
      listings: [
        { sourceId: "himalayas", status: "closed" },
        { sourceId: "remotive", status: "closed" },
      ],
    });
    seedMarks(t.db, [p], { mark: "applied" });
    expect(runMarkedView(deps, snapshots, "").items[0]?.listings).toEqual([
      expect.objectContaining({ source_id: "himalayas", status: "closed", url: null }),
      expect.objectContaining({ source_id: "remotive", status: "closed", url: null }),
    ]);
  });

  it("narrows by skills over every listing, closed ones too, and does not save them", () => {
    const go = addPosting(t.db, { title: "Go engineer", ...closed });
    const react = addPosting(t.db, { title: "React engineer" });
    seedMarks(t.db, [go, react], { mark: "skipped" });

    const view = runMarkedView(deps, snapshots, "Go");
    expect(view.items.map((p) => p.id)).toEqual([go]);
    expect(view.items[0]?.matched_skills).toEqual([{ skill: "Go", in_title: true }]);
    expect(view).toMatchObject({ skills: ["Go"], marked_count: 1 });
    expect(readState(t.db).lastSkills).toEqual([]);
  });

  it("fixes the order when the view loads; later pages show fresh mark states, never repeat or skip", () => {
    const ids = Array.from({ length: 120 }, (_, i) => {
      const id = addPosting(t.db);
      seedMarks(t.db, [id], { mark: "skipped", markedAt: 1000 - i });
      return id;
    });
    const first = runMarkedView(deps, snapshots, "");
    // Since loading: a later posting is re-marked (it would now sort first) and one is removed.
    t.db.run(sql`update tracking_marks set mark = 'applied', marked_at = 5000 where posting_id = ${ids[60]}`);
    t.db.run(sql`delete from collector_listings where posting_id = ${ids[61]}`);
    t.db.run(sql`delete from collector_postings where id = ${ids[61]}`);

    const second = nextMarkedPage(deps, snapshots, first.snapshot_id, first.next_cursor as string);
    const third = nextMarkedPage(deps, snapshots, first.snapshot_id, second.next_cursor as string);
    const shown = [...first.items, ...second.items, ...third.items].map((p) => p.id);
    expect(shown).toEqual(ids.filter((id) => id !== ids[61]));
    expect(second.items[10]?.mark_state.mark).toBe("applied");
    expect(third).toMatchObject({ has_next: false, next_cursor: null });
  });

  it("is empty when nothing is marked", () => {
    addPosting(t.db);
    expect(runMarkedView(deps, snapshots, "")).toMatchObject({
      marked_count: 0,
      cleared_count: 0,
      items: [],
    });
  });
});

describe("marked view routes (contract)", () => {
  let dir: string;
  let app: FastifyInstance;
  let posting: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "job-radar-marked-"));
    const databaseFile = join(dir, "job-radar.sqlite");
    const handle = openDb(databaseFile);
    runMigrations(handle.db);
    posting = addPosting(handle.db, {
      title: "Go engineer",
      status: "closed",
      listings: [{ status: "closed" }],
    });
    seedMarks(handle.db, [posting], { mark: "applied" });
    handle.close();
    app = await buildApp({ port: 3000, collector: { databaseFile, scheduler: false } });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (url: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { host: "127.0.0.1:3000" }, payload });

  it("runMarkedView and getNextMarkedPage answer the contract shapes; 400, 410 as specified", async () => {
    const view = await post("/api/v1/search/marked-snapshots", { skills: "Go" });
    expect(view.statusCode).toBe(200);
    scoredContract.expectContract("runMarkedView", 200, view.json());
    expect(view.json().items[0].id).toBe(posting);

    const page = await post(`/api/v1/search/marked-snapshots/${view.json().snapshot_id}/pages`, {
      cursor: "50",
    });
    expect(page.statusCode).toBe(200);
    scoredContract.expectContract("getNextMarkedPage", 200, page.json());

    const invalid = await post("/api/v1/search/marked-snapshots", {
      skills: Array.from({ length: 21 }, (_, i) => `s${i}`).join(","),
    });
    expect(invalid.statusCode).toBe(400);
    contract.expectContract("runMarkedView", 400, invalid.json());

    const gone = await post(`/api/v1/search/marked-snapshots/01926a3b-1c2d-7e4f-8a00-0000000000ff/pages`, {
      cursor: "50",
    });
    expect(gone.statusCode).toBe(410);
    contract.expectContract("getNextMarkedPage", 410, gone.json());
  });

  it("does not page a main-list snapshot as a marked one", async () => {
    const main = await post("/api/v1/search/snapshots", { skills: "" });
    const res = await post(`/api/v1/search/marked-snapshots/${main.json().snapshot_id}/pages`, {
      cursor: "0",
    });
    expect(res.statusCode).toBe(410);
  });
});
