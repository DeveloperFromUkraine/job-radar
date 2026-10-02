import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { finalizeRun } from "../src/modules/collector/app/finalize.js";
import { type FetchVerdict, ingestSource } from "../src/modules/collector/app/ingest.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { type FakeSources, json, startFakeSources } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 2, 12);
type Row = Record<string, unknown>;

const remotiveJob = (n: number) => ({
  id: n,
  url: `https://jobs.example.test/remotive/${n}`,
  title: `Backend Engineer ${n}`,
  company_name: "Example Co",
  category: "Software Development",
  publication_date: "2026-10-02T09:00:00",
  candidate_required_location: "Europe",
  description: "",
});
const remotivePage = (ids: number[]) =>
  JSON.stringify({ "job-count": ids.length, "total-job-count": ids.length, jobs: ids.map(remotiveJob) });
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

describe("finalize a run (Flow 7)", () => {
  let db: TempDb;
  let dir: string;
  let fake: FakeSources;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(async () => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-finalize-"));
    fake = await startFakeSources();
    now = T0;
    deps = {
      db: db.db,
      now: () => now,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: fake.baseUrl }),
      timeZone: "Europe/Warsaw",
    };
    startUp(deps);
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [] }))); // Himalayas: nothing new
  });

  afterEach(async () => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));

  /** One full run: open, ingest every due source in order, finalize. */
  async function fullRun(at: number) {
    now = at;
    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error(`no run at ${at}: ${run.kind}`);
    const verdicts: FetchVerdict[] = [];
    for (const sourceId of run.due) verdicts.push(await ingestSource(deps, run, sourceId));
    finalizeRun(deps, run, verdicts);
    return run;
  }
  const outcome = (runId: string, sourceId: string) =>
    rows(
      `select closed, held from collector_run_sources where run_id = '${runId}' and source_id = '${sourceId}'`,
    )[0];

  it("closes a posting whose only listing is absent from a complete fetch, and finishes the run (AC-07)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([])));
    fake.route("/api/remote-jobs", json(remotivePage([1, 2])));
    await fullRun(T0);
    fake.route("/api/remote-jobs", json(remotivePage([2])));

    const run = await fullRun(T0 + 6 * HOUR);

    expect(rows("select title, status, closed_at from collector_postings order by title")).toEqual([
      { title: "Backend Engineer 1", status: "closed", closed_at: T0 + 6 * HOUR },
      { title: "Backend Engineer 2", status: "open", closed_at: null },
    ]);
    expect(outcome(run.runId, "remotive")).toEqual({ closed: 1, held: 0 });
    expect(rows(`select status, finished_at from collector_runs where id = '${run.runId}'`)).toEqual([
      { status: "finished", finished_at: T0 + 6 * HOUR },
    ]);
  });

  it("closes nothing from a failed fetch (AC-03, AC-08)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([])));
    fake.route("/api/remote-jobs", json(remotivePage([1])));
    await fullRun(T0);
    fake.route("/api/remote-jobs", json("{}", 500));

    await fullRun(T0 + 6 * HOUR);

    expect(rows("select status from collector_postings")).toEqual([{ status: "open" }]);
  });

  it("keeps a posting open while another source still lists it (AC-09)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([1])));
    fake.route("/api/remote-jobs", json(remotivePage([1])));
    await fullRun(T0);
    expect(rows("select count(*) as n from collector_postings")).toEqual([{ n: 1 }]);
    fake.route("/api/remote-jobs", json(remotivePage([])));

    await fullRun(T0 + 6 * HOUR);

    expect(rows("select status from collector_postings")).toEqual([{ status: "open" }]);
    expect(rows("select source_id, status from collector_listings order by source_id")).toEqual([
      { source_id: "jobicy", status: "open" },
      { source_id: "remotive", status: "closed" },
    ]);
  });

  it("holds back closures above 30% and flags the source, then re-checks by itself (AC-14)", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => i + 1);
    fake.route("/api/v2/remote-jobs", json(jobicyPage([])));
    fake.route("/api/remote-jobs", json(remotivePage(ten)));
    await fullRun(T0);
    fake.route("/api/remote-jobs", json(remotivePage(ten.slice(4))));

    const held = await fullRun(T0 + 6 * HOUR);

    expect(rows("select count(*) as n from collector_postings where status = 'open'")).toEqual([{ n: 10 }]);
    expect(outcome(held.runId, "remotive")).toEqual({ closed: 0, held: 4 });
    expect(rows("select kind, reason from collector_source_flags where source_id = 'remotive'")).toEqual([
      { kind: "held_back", reason: "Would close 40% of its 10 open postings - 4 closures held back." },
    ]);

    fake.route("/api/remote-jobs", json(remotivePage(ten)));
    await fullRun(T0 + 12 * HOUR);
    expect(rows("select kind from collector_source_flags where source_id = 'remotive'")).toEqual([]);
  });

  it("flags a source failing on two consecutive due runs and clears it after a good read (AC-13)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([])));
    fake.route("/api/remote-jobs", json("{}", 503));
    await fullRun(T0);
    expect(rows("select kind from collector_source_flags where source_id = 'remotive'")).toEqual([]);

    await fullRun(T0 + 6 * HOUR);
    expect(
      rows("select kind, reason, raised_at from collector_source_flags where source_id = 'remotive'"),
    ).toEqual([
      {
        kind: "failing",
        reason: "Failed on the last 2 due runs - the source could not be reached.",
        raised_at: T0 + 6 * HOUR,
      },
    ]);

    fake.route("/api/remote-jobs", json(remotivePage([1])));
    await fullRun(T0 + 12 * HOUR);
    expect(rows("select kind from collector_source_flags where source_id = 'remotive'")).toEqual([]);
  });

  it("returns the calendar day to clean up for, once per day", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([])));
    fake.route("/api/remote-jobs", json(remotivePage([])));
    now = T0;
    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error("no run");
    const verdicts = [];
    for (const s of run.due) verdicts.push(await ingestSource(deps, run, s));
    expect(finalizeRun(deps, run, verdicts)).toEqual({ cleanupDay: "2026-10-02" });
  });
  it("keeps postings open when the owner removes their category while the source still offers them (AC-23)", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => i + 1);
    fake.route("/api/v2/remote-jobs", json(jobicyPage([])));
    fake.route("/api/remote-jobs", json(remotivePage(ten)));
    await fullRun(T0);
    writeFileSync(
      deps.settingsFile,
      JSON.stringify({
        sources: { ...DEFAULT_SETTINGS.sources, remotive: { enabled: true, categories: ["Devops"] } },
      }),
    );

    await fullRun(T0 + 6 * HOUR);

    expect(rows("select count(*) as n from collector_postings where status = 'open'")).toEqual([{ n: 10 }]);
    expect(rows("select count(*) as n from collector_listings where status = 'open'")).toEqual([{ n: 10 }]);
    expect(rows("select kind from collector_source_flags where source_id = 'remotive'")).toEqual([]);
    // Still offered but no longer in the owner's categories: they age out as usual (no new offer time).
    expect(rows("select distinct last_offered_at from collector_postings")).toEqual([
      { last_offered_at: T0 },
    ]);
  });
});
