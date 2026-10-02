import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { continueFill } from "../src/modules/collector/app/first-fill.js";
import { ingestSource } from "../src/modules/collector/app/ingest.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { fillReadAllowed } from "../src/modules/collector/domain/schedule.js";
import { type SourceDefinition, sourceById } from "../src/modules/collector/domain/sources.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { type FakeSources, json, startFakeSources } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 2, 12);
type Row = Record<string, unknown>;

const himalayasJob = (n: number, daysAgo: number) => ({
  guid: `https://jobs.example.test/himalayas/${n}`,
  title: `Backend Engineer ${n}`,
  companyName: "Example Co",
  parentCategories: ["Developer"],
  locationRestrictions: [],
  timezoneRestrictions: [],
  pubDate: Math.floor((T0 - daysAgo * DAY) / 1000),
  expiryDate: Math.floor((T0 + 30 * DAY) / 1000),
});
const himalayasPage = (jobs: object[], nextCursor: string | null) => JSON.stringify({ jobs, nextCursor });

describe("fill budget (AC-19: regular reads always come first)", () => {
  it.each(["jobicy", "himalayas", "remotive"] as const)(
    "%s has nothing left for a fill under its current limits",
    (id) => {
      expect(fillReadAllowed(sourceById(id), [], T0)).toBe(false);
    },
  );

  it("allows fill reads only beyond the reads its regular schedule needs", () => {
    const roomy: SourceDefinition = { ...sourceById("himalayas"), limits: { perDay: 6 } }; // 4 regular + 2 fill
    expect(fillReadAllowed(roomy, [T0 - HOUR], T0)).toBe(true);
    expect(fillReadAllowed(roomy, [T0 - HOUR, T0 - 2 * HOUR], T0)).toBe(true);
    expect(fillReadAllowed(roomy, [T0 - HOUR, T0 - 2 * HOUR, T0 - 3 * HOUR], T0)).toBe(false);
  });
});

describe("first fill of a never-read source (Flow 8)", () => {
  let db: TempDb;
  let dir: string;
  let fake: FakeSources;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(async () => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-fill-"));
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
    fake.route("/api/v2/remote-jobs", json(JSON.stringify({ hasMore: false, jobs: [] })));
    fake.route("/api/remote-jobs", json(JSON.stringify({ "job-count": 0, "total-job-count": 0, jobs: [] })));
  });

  afterEach(async () => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));
  async function firstRun(source?: SourceDefinition) {
    const run = openRun(deps, "catch_up");
    if (run.kind !== "started") throw new Error("no run");
    const verdict = await ingestSource(deps, run, "himalayas");
    await continueFill(deps, run, verdict, source);
    return run;
  }

  it("shows the regular read's postings at once, marked as first fill", async () => {
    fake.route("/jobs/api", json(himalayasPage([himalayasJob(1, 0)], null)));
    await firstRun();
    expect(rows("select source_item_id, is_first_fill from collector_listings")).toEqual([
      { source_item_id: "https://jobs.example.test/himalayas/1", is_first_fill: 1 },
    ]);
  });

  it("completes when the source offers nothing older", async () => {
    fake.route("/jobs/api", json(himalayasPage([himalayasJob(1, 2)], null)));
    await firstRun();
    expect(
      rows(
        "select fill_status, fill_reached_at, fill_completed_at from collector_sources where id = 'himalayas'",
      ),
    ).toEqual([
      {
        fill_status: "complete",
        fill_reached_at: T0 - 2 * DAY - ((T0 - 2 * DAY) % 1000),
        fill_completed_at: T0,
      },
    ]);
  });

  it("continues later, with a next-part time, when the regular reads leave no budget", async () => {
    fake.route("/jobs/api", json(himalayasPage([himalayasJob(1, 1)], "cursor-2")));
    await firstRun();
    expect(fake.requests.filter((r) => r.startsWith("/jobs/api"))).toHaveLength(1);
    const [row] = rows(
      "select fill_status, fill_next_part_due_at from collector_sources where id = 'himalayas'",
    );
    expect(row?.fill_status).toBe("continuing");
    expect(row?.fill_next_part_due_at).toBe(T0 + DAY);
  });

  it("pages older listings newest first within the leftover budget, then stops at 30 days", async () => {
    const roomy: SourceDefinition = { ...sourceById("himalayas"), limits: { perDay: 8 } }; // 4 spare reads
    fake.route("/jobs/api", (req, res) => {
      const cursor = new URL(req.url ?? "", "http://x").searchParams.get("cursor");
      const page =
        cursor === null
          ? himalayasPage([himalayasJob(1, 1)], "c2")
          : cursor === "c2"
            ? himalayasPage([himalayasJob(2, 12)], "c3")
            : himalayasPage([himalayasJob(3, 31)], "c4");
      res.writeHead(200, { "content-type": "application/json" }).end(page);
    });

    await firstRun(roomy);

    expect(fake.requests.filter((r) => r.startsWith("/jobs/api"))).toEqual([
      "/jobs/api?limit=20",
      "/jobs/api?limit=20&cursor=c2",
      "/jobs/api?limit=20&cursor=c3",
    ]);
    expect(rows("select count(*) as n from collector_listings where is_first_fill = 1")).toEqual([{ n: 3 }]);
    expect(rows("select fill_status from collector_sources where id = 'himalayas'")).toEqual([
      { fill_status: "complete" },
    ]);
  });

  it("ends this part of the fill on a refused page without a failure", async () => {
    const roomy: SourceDefinition = { ...sourceById("himalayas"), limits: { perDay: 8 } };
    fake.route("/jobs/api", (req, res) => {
      if (req.url?.includes("cursor")) res.writeHead(429).end();
      else
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(himalayasPage([himalayasJob(1, 1)], "c2"));
    });

    const run = await firstRun(roomy);

    expect(rows("select fill_status from collector_sources where id = 'himalayas'")).toEqual([
      { fill_status: "continuing" },
    ]);
    expect(
      rows(
        `select outcome from collector_run_sources where run_id = '${run.runId}' and source_id = 'himalayas'`,
      ),
    ).toEqual([{ outcome: "capped" }]);
  });

  it("does not mark later regular reads as first fill", async () => {
    fake.route("/jobs/api", json(himalayasPage([himalayasJob(1, 1)], null)));
    await firstRun();
    db.db.run(sql`update collector_runs set status = 'finished'`);
    fake.route("/jobs/api", json(himalayasPage([himalayasJob(5, 0)], null)));
    now = T0 + 6 * HOUR;

    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error("no run");
    await ingestSource(deps, run, "himalayas");

    expect(
      rows("select source_item_id, is_first_fill from collector_listings order by source_item_id"),
    ).toEqual([
      { source_item_id: "https://jobs.example.test/himalayas/1", is_first_fill: 1 },
      { source_item_id: "https://jobs.example.test/himalayas/5", is_first_fill: 0 },
    ]);
  });
  it("does not mark regular reads as first fill while a slow fill continues", async () => {
    fake.route("/jobs/api", json(himalayasPage([himalayasJob(1, 1)], "cursor-2")));
    await firstRun(); // continuing: the regular schedule leaves no budget
    db.db.run(sql`update collector_runs set status = 'finished'`);
    fake.route("/jobs/api", json(himalayasPage([himalayasJob(6, 0)], "cursor-3")));
    now = T0 + 6 * HOUR;

    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error("no run");
    await ingestSource(deps, run, "himalayas");

    expect(rows("select is_first_fill from collector_listings where source_item_id like '%/6'")).toEqual([
      { is_first_fill: 0 },
    ]);
  });
});
