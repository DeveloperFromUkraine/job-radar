import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DbHandle, openDb, runMigrations } from "../src/core/db.js";
import { dailyCleanup } from "../src/modules/collector/app/cleanup.js";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { finalizeRun } from "../src/modules/collector/app/finalize.js";
import { type FetchVerdict, ingestSource } from "../src/modules/collector/app/ingest.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore } from "../src/modules/search/app/snapshots.js";
import type { TrackingDeps } from "../src/modules/tracking/app/deps.js";
import { setMark } from "../src/modules/tracking/app/marks.js";
import { protectedPostings } from "../src/modules/tracking/app/protected-postings.js";
import { getMark } from "../src/modules/tracking/infra/repo.js";
import { type FakeSources, json, startFakeSources, xml } from "./helpers/fake-sources.js";
import { setSearchState } from "./helpers/search-fixtures.js";

// QG-1 / AC-08, AC-09: a decided posting never comes back on its own — through every collector event
// (merge, text update, close, reopen), a restart, and clean-up — with real tracking marks.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 2, 12);
const TZ = "Europe/Warsaw";

let description = "";
const remotivePage = (ids: number[]) =>
  JSON.stringify({
    "job-count": ids.length,
    "total-job-count": ids.length,
    jobs: ids.map((n) => ({
      id: n,
      url: `https://jobs.example.test/remotive/${n}`,
      title: `Backend Engineer ${n}`,
      company_name: "Example Co",
      category: "Software Development",
      publication_date: "2026-10-02T09:00:00",
      candidate_required_location: "Europe",
      description: n === 2 ? description : "",
    })),
  });
const jobicyPage = (ids: number[]) =>
  JSON.stringify({
    hasMore: false,
    jobs: ids.map((n) => ({
      id: n,
      url: `https://jobs.example.test/jobicy/${n}`,
      jobTitle: `Backend Engineer ${n}`,
      companyName: "Example Co",
      jobIndustry: ["Software Engineering"],
      jobGeo: "Europe",
      pubDate: "2026-10-02T08:00:00+00:00",
    })),
  });

describe("marks hold through every collector event and a restart (AC-08, AC-09)", () => {
  let dir: string;
  let file: string;
  let handle: DbHandle;
  let fake: FakeSources;
  let now: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "job-radar-events-"));
    file = join(dir, "job-radar.sqlite");
    handle = openDb(file);
    runMigrations(handle.db);
    fake = await startFakeSources();
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [] })));
    fake.route("/remote-jobs.rss", xml('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'));
    now = T0;
    description = "Go services";
  });
  afterEach(async () => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  });

  const collector = (): CollectorDeps => ({
    db: handle.db,
    now: () => now,
    settingsFile: join(dir, "settings.json"),
    adapters: createAdapters({ baseUrl: fake.baseUrl }),
    timeZone: TZ,
  });
  const tracking = (): TrackingDeps => ({ db: handle.db, now: () => now, timeZone: TZ });

  async function fullRun(remotive: number[], jobicy: number[], at: number) {
    now = at;
    fake.route("/api/remote-jobs", json(remotivePage(remotive)));
    fake.route("/api/v2/remote-jobs", json(jobicyPage(jobicy)));
    const deps = collector();
    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error(`no run at ${at}: ${run.kind}`);
    const verdicts: FetchVerdict[] = [];
    for (const sourceId of run.due) verdicts.push(await ingestSource(deps, run, sourceId));
    finalizeRun(deps, run, verdicts);
  }

  const posting = (title: string) =>
    handle.db.get<{ id: string; status: string; first_found_at: number }>(
      sql`select id, status, first_found_at from collector_postings where title = ${title}`,
    );
  const listings = (id: string) =>
    handle.db.all<{ source_id: string }>(
      sql`select source_id from collector_listings where posting_id = ${id} order by source_id`,
    );
  const list = () =>
    runSearch(
      { db: handle.db, now: () => now },
      createSnapshotStore(() => now),
      "",
    );

  it("keeps each mark and first-collected time, never lists the posting again, never counts it as new", async () => {
    startUp(collector());
    setSearchState(handle.db, { previousVisitStartedAt: T0 - HOUR }); // everything collected after is new
    await fullRun([1, 2, 3], [], T0);
    const applied = posting("Backend Engineer 1");
    const skipped = posting("Backend Engineer 2");
    if (!applied || !skipped) throw new Error("seed postings missing");
    setMark(tracking(), applied.id, "applied");
    setMark(tracking(), skipped.id, "skipped");
    const marksBefore = [getMark(handle.db, applied.id), getMark(handle.db, skipped.id)];

    const expectDecidedStayDecided = (event: string) => {
      expect([getMark(handle.db, applied.id), getMark(handle.db, skipped.id)], event).toEqual(marksBefore);
      expect(posting("Backend Engineer 1")?.first_found_at, event).toBe(applied.first_found_at);
      expect(posting("Backend Engineer 2")?.first_found_at, event).toBe(skipped.first_found_at);
      const shown = list();
      expect(
        shown.items.map((p) => p.title),
        event,
      ).toEqual(["Backend Engineer 3"]);
      expect(shown, event).toMatchObject({ total: 1, new_count: 1 });
    };
    expectDecidedStayDecided("after marking");

    // Merge: another source lists the applied role; it joins the same posting.
    await fullRun([1, 2, 3], [1], T0 + 6 * HOUR);
    expect(listings(applied.id)).toEqual([{ source_id: "jobicy" }, { source_id: "remotive" }]);
    expectDecidedStayDecided("after a merge");

    // Update: the skipped posting's text changes.
    description = "Go and Rust services";
    await fullRun([1, 2, 3], [1], T0 + 12 * HOUR);
    expectDecidedStayDecided("after a text update");

    // Close: the skipped posting is gone from its only source.
    await fullRun([1, 3], [1], T0 + 18 * HOUR);
    expect(posting("Backend Engineer 2")?.status).toBe("closed");
    expectDecidedStayDecided("after closing");

    // Reopen: the source offers it again under the same posting.
    await fullRun([1, 2, 3], [1], T0 + 24 * HOUR);
    expect(posting("Backend Engineer 2")).toMatchObject({ id: skipped.id, status: "open" });
    expectDecidedStayDecided("after reopening");

    // Restart: a new connection to the same file.
    handle.close();
    handle = openDb(file);
    expectDecidedStayDecided("after a restart");

    // Clean-up: both past 60 days; the skipped one goes like an unmarked one, the applied one stays.
    handle.db.run(sql`update collector_postings set status = 'closed', closed_at = ${now - 61 * DAY},
      last_offered_at = ${now - 61 * DAY} where id in (${applied.id}, ${skipped.id})`);
    await dailyCleanup(collector(), "2026-10-03", protectedPostings(tracking()));
    expect(posting("Backend Engineer 1")?.id).toBe(applied.id);
    expect(posting("Backend Engineer 2")).toBeUndefined();
    expect(getMark(handle.db, applied.id)).toEqual(marksBefore[0]);
    expect(getMark(handle.db, skipped.id)).toBeNull();
  }, 60_000);
});
