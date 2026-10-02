import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { ingestSource } from "../src/modules/collector/app/ingest.js";
import { noMarks } from "../src/modules/collector/app/marked-postings.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { executeRun } from "../src/modules/collector/app/run-pipeline.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { readsInWindows } from "../src/modules/collector/domain/schedule.js";
import { SOURCES } from "../src/modules/collector/domain/sources.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { type FakeSources, json, startFakeSources } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 2, 0);
type Row = Record<string, unknown>;

// ~300 new listings a day across sources (sad §7): Jobicy pages of 200, Remotive ~60, Himalayas 20.
const jobicyPage = (n: number, at: number) =>
  JSON.stringify({
    hasMore: true,
    jobs: Array.from({ length: n }, (_, i) => ({
      id: 100_000 + i,
      url: `https://jobs.example.test/jobicy/${i}`,
      jobTitle: `Backend Engineer ${i}`,
      companyName: `Example ${i % 40} Co`,
      jobIndustry: ["Software Engineering"],
      jobGeo: i % 3 === 0 ? "Anywhere" : "Europe",
      jobDescription: "<p>Role.</p>",
      pubDate: new Date(at - i * 10 * MIN).toISOString(),
    })),
  });
const remotivePage = (n: number, at: number) =>
  JSON.stringify({
    "job-count": n,
    "total-job-count": n,
    jobs: Array.from({ length: n }, (_, i) => ({
      id: 200_000 + i,
      url: `https://jobs.example.test/remotive/${i}`,
      title: `Backend Engineer ${i}`,
      company_name: `Example ${i % 40} Co`,
      category: "Software Development",
      publication_date: new Date(at - i * 20 * MIN).toISOString().slice(0, 19),
      candidate_required_location: "Worldwide",
      description: "",
    })),
  });
const himalayasPage = (n: number, at: number) =>
  JSON.stringify({
    nextCursor: null,
    jobs: Array.from({ length: n }, (_, i) => ({
      guid: `https://jobs.example.test/himalayas/${i}`,
      title: `Data Engineer ${i}`,
      companyName: `Sample ${i} Ltd`,
      parentCategories: ["Developer"],
      locationRestrictions: ["Poland"],
      timezoneRestrictions: [],
      pubDate: Math.floor((at - i * HOUR) / 1000),
      expiryDate: Math.floor((at + 30 * DAY) / 1000),
    })),
  });

describe("collection end to end against a fake source server", () => {
  let db: TempDb;
  let dir: string;
  let fake: FakeSources;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(async () => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-e2e-"));
    fake = await startFakeSources();
    now = T0;
    fake.route("/api/v2/remote-jobs", (_q, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end(jobicyPage(200, now));
    });
    fake.route("/api/remote-jobs", (_q, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end(remotivePage(60, now));
    });
    fake.route("/jobs/api", (_q, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end(himalayasPage(20, now));
    });
    deps = {
      db: db.db,
      now: () => now,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: fake.baseUrl }),
      timeZone: "Europe/Warsaw",
    };
  });

  afterEach(async () => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));

  it("never exceeds any source's limit over 7 days of restarts, interruptions and collect-now every minute (AC-02)", async () => {
    startUp(deps);
    const reads: Record<string, number[]> = {};
    let ledgered = 0;
    for (; now < T0 + 7 * DAY; now += MIN) {
      if ((now - T0) % (10 * HOUR) === 0) startUp(deps); // a restart every 10 hours
      for (const trigger of ["schedule", "collect_now"] as const) {
        const run = openRun(deps, trigger);
        if (run.kind !== "started") continue;
        // Every 13th run is interrupted after its first source — it never finalizes.
        if ((now / MIN) % 13 === 0) {
          await ingestSource(deps, run, run.due[0] as never);
          startUp(deps);
          continue;
        }
        await executeRun(deps, run, noMarks);
      }
      for (const r of rows(
        `select source_id, sent_at from collector_request_ledger where sent_at = ${now}`,
      )) {
        const id = r.source_id as string;
        reads[id] = [...(reads[id] ?? []), now];
        ledgered++;
      }
      for (const source of SOURCES) {
        const w = readsInWindows(reads[source.id] ?? [], now);
        const { perMinute = Infinity, perHour = Infinity, perDay = Infinity } = source.limits;
        expect(w.minute <= perMinute && w.hour <= perHour && w.day <= perDay, `${source.id} at ${now}`).toBe(
          true,
        );
      }
    }
    // Every request the sources saw was ledgered first — nothing went out uncounted.
    expect(fake.requests).toHaveLength(ledgered);
    expect(reads.jobicy?.length).toBe(7 * 24);
    expect(reads.weworkremotely).toBeUndefined();
  }, 120_000);

  it("records an interrupted run as incomplete, closes nothing, and keeps what it collected (AC-20)", async () => {
    startUp(deps);
    const first = openRun(deps, "schedule");
    if (first.kind !== "started") throw new Error("no run");
    await executeRun(deps, first, noMarks);
    expect(rows("select count(*) as n from collector_postings where status = 'open'")[0]?.n).toBeGreaterThan(
      0,
    );

    now += 6 * HOUR;
    fake.route("/api/remote-jobs", json(JSON.stringify({ "job-count": 0, "total-job-count": 0, jobs: [] })));
    const second = openRun(deps, "schedule");
    if (second.kind !== "started") throw new Error("no run");
    await ingestSource(deps, second, "jobicy"); // fetch finished before the interruption
    // ... the laptop sleeps here: remotive (now empty) is never read, the run never finalizes.
    now += 3 * HOUR;
    startUp(deps);

    expect(rows(`select status from collector_runs where id = '${second.runId}'`)).toEqual([
      { status: "incomplete" },
    ]);
    expect(rows("select count(*) as n from collector_postings where status = 'closed'")).toEqual([{ n: 0 }]);
    expect(
      rows(
        "select id, last_success_at from collector_sources where id in ('jobicy', 'remotive') order by id",
      ),
    ).toEqual([
      { id: "jobicy", last_success_at: T0 + 6 * HOUR },
      { id: "remotive", last_success_at: T0 },
    ]);
    expect(openRun(deps, "catch_up").kind).toBe("started");
  });

  it("starts a catch-up run within one minute of the app starting (AC-18)", async () => {
    const dataDir = join(dir, "data");
    mkdirSync(dataDir);
    const databaseFile = join(dataDir, "job-radar.sqlite");
    const handle = openDb(databaseFile);
    runMigrations(handle.db);
    handle.db.run(sql`insert into collector_sources (id, fill_status, last_read_at, last_success_at)
      values ('jobicy', 'complete', ${Date.now() - 3 * HOUR}, ${Date.now() - 3 * HOUR})`);
    handle.close();
    let app: FastifyInstance | undefined;
    try {
      const started = Date.now();
      app = await buildApp({ collector: { databaseFile, sourcesBaseUrl: fake.baseUrl } });
      await app.ready();
      const check = openDb(databaseFile);
      try {
        while (check.db.all(sql`select id from collector_runs where trigger = 'catch_up'`).length === 0) {
          if (Date.now() - started > MIN) throw new Error("no catch-up run within one minute");
          await new Promise((r) => setTimeout(r, 20));
        }
      } finally {
        check.close();
      }
      expect(Date.now() - started).toBeLessThan(MIN);
    } finally {
      await app?.close();
    }
  });

  describe("NFR validation (test-plan §NFR)", () => {
    it("a regular run takes at most 5 min at p95 (20 runs at daily volume)", async () => {
      startUp(deps);
      const durations: number[] = [];
      for (let i = 0; i < 20; i++) {
        now = T0 + i * 6 * HOUR;
        const run = openRun(deps, "schedule");
        if (run.kind !== "started") throw new Error(`no run ${i}`);
        const t = performance.now();
        await executeRun(deps, run, noMarks);
        durations.push(performance.now() - t);
      }
      durations.sort((a, b) => a - b);
      const p95 = durations[Math.ceil(0.95 * durations.length) - 1] as number;
      expect(p95).toBeLessThan(5 * MIN);
    }, 120_000);

    it("the first fill of an hourly source completes within 30 min", async () => {
      startUp(deps);
      const run = openRun(deps, "catch_up");
      if (run.kind !== "started") throw new Error("no run");
      const t = performance.now();
      await executeRun(deps, run, noMarks);
      expect(performance.now() - t).toBeLessThan(30 * MIN);
      expect(rows("select fill_status from collector_sources where id = 'jobicy'")).toEqual([
        { fill_status: "complete" },
      ]);
      expect(rows("select count(*) as n from collector_listings where source_id = 'jobicy'")).toEqual([
        { n: 200 },
      ]);
    });
  });
});
