import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { ingestSource } from "../src/modules/collector/app/ingest.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { type SourceId, sourceById } from "../src/modules/collector/domain/sources.js";
import { createSourceHttp } from "../src/modules/collector/infra/http.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { statesPay } from "../src/modules/realness/domain/pay.js";
import type { SearchDeps } from "../src/modules/search/app/deps.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { type FakeSources, fixture, json, startFakeSources, xml } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// realness-score T05: each board's own pay field on every fetch, and the reopening time (collector AC-11 amended).
const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 2, 12);
type Row = Record<string, unknown>;

const jobicyPage = (jobs: object[]) =>
  JSON.stringify({ jobs, hasMore: false, nextCursor: null, success: true, jobCount: jobs.length });
const jobicyJob = (over: Record<string, unknown> = {}) => ({
  id: 900003,
  url: "https://jobs.example.test/jobicy/900003",
  jobTitle: "Senior Backend Engineer",
  companyName: "Example Co",
  jobIndustry: ["Software Engineering"],
  jobGeo: "Europe",
  jobDescription: "<p>Build things.</p>",
  pubDate: "2026-10-02T10:00:00+00:00",
  ...over,
});

describe("collector keeps the pay field and the reopening time (realness-score T05)", () => {
  let db: TempDb;
  let dir: string;
  let fake: FakeSources;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(async () => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-realness-facts-"));
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
  });

  afterEach(async () => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
    await fake.close();
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));
  const finish = () => db.db.run(sql`update collector_runs set status = 'finished' where status = 'running'`);
  async function runSource(sourceId: "jobicy" | "remotive" | "himalayas") {
    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error(`no run: ${run.kind}`);
    await ingestSource(deps, run, sourceId);
    finish();
    return run;
  }
  const fetchLatest = (id: SourceId) =>
    createAdapters({ baseUrl: fake.baseUrl })[id].fetchLatest({
      http: createSourceHttp(db.db, sourceById(id), { now: () => now }),
      now,
    });
  const payFields = async (id: SourceId) => (await fetchLatest(id)).listings.map((l) => l.payField);

  describe("each board's pay field, as a person would read it", () => {
    it("Jobicy: min–max with currency; nothing stated → empty", async () => {
      fake.route("/api/v2/remote-jobs", json(fixture("jobicy/complete.json")));
      expect(await payFields("jobicy")).toEqual(["USD 60000–80000", "", ""]);
    });

    it("Himalayas: min–max with currency and period; nulls → empty", async () => {
      fake.route("/jobs/api", json(fixture("himalayas/latest.json")));
      expect(await payFields("himalayas")).toEqual([
        "",
        "USD 126000–136000 per year",
        "USD 95000–125000 per year",
      ]);
    });

    it("Himalayas with only a minimum keeps that amount", async () => {
      const body = JSON.parse(fixture("himalayas/latest.json"));
      body.jobs = [{ ...body.jobs[1], maxSalary: null }];
      fake.route("/jobs/api", json(JSON.stringify(body)));
      expect(await payFields("himalayas")).toEqual(["USD 126000 per year"]);
    });

    it("Remotive: the salary field as stated", async () => {
      fake.route("/api/remote-jobs", json(fixture("remotive/complete.json")));
      expect(await payFields("remotive")).toEqual(["", "", "$50-$75 /hour"]);
    });

    it("We Work Remotely has no pay field", async () => {
      fake.route("/remote-jobs.rss", xml(fixture("weworkremotely/latest.rss")));
      const fields = await payFields("weworkremotely");
      expect(fields.length).toBeGreaterThan(0);
      expect(new Set(fields)).toEqual(new Set([""]));
    });

    it("every non-empty structured field is read as pay by the amount parser (T02)", async () => {
      fake.route("/api/v2/remote-jobs", json(fixture("jobicy/complete.json")));
      fake.route("/jobs/api", json(fixture("himalayas/latest.json")));
      fake.route("/api/remote-jobs", json(fixture("remotive/complete.json")));
      const fields = [
        ...(await payFields("jobicy")),
        ...(await payFields("himalayas")),
        ...(await payFields("remotive")),
      ];
      const stated = fields.filter((f) => f !== "");
      expect(stated).toHaveLength(4);
      for (const f of stated) expect(statesPay(f), f).toBe(true);
    });
  });

  describe("writing the pay field", () => {
    it("stores it with the listing on the first fetch", async () => {
      fake.route("/api/v2/remote-jobs", json(fixture("jobicy/complete.json")));
      await runSource("jobicy");
      expect(
        rows("select source_item_id, pay_field from collector_listings order by source_item_id"),
      ).toEqual([
        // 900001 is outside the owner's categories, so not stored.
        { source_item_id: "900002", pay_field: "" },
        { source_item_id: "900003", pay_field: "USD 60000–80000" },
      ]);
    });

    it("writes it on every fetch, even when nothing else changed (unknown → known)", async () => {
      fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
      await runSource("jobicy");
      db.db.run(sql`update collector_listings set pay_field = null`); // as if collected before this shipped
      now = T0 + HOUR;
      const run = await runSource("jobicy");
      expect(rows("select pay_field from collector_listings")).toEqual([{ pay_field: "" }]);
      expect(
        rows(
          `select updated from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`,
        ),
      ).toEqual([{ updated: 0 }]);
    });

    it("a change in the pay field alone is not an updated posting", async () => {
      fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
      await runSource("jobicy");
      now = T0 + HOUR;
      fake.route(
        "/api/v2/remote-jobs",
        json(jobicyPage([jobicyJob({ salaryMin: 90000, salaryMax: 110000, salaryCurrency: "EUR" })])),
      );
      const run = await runSource("jobicy");
      expect(rows("select pay_field from collector_listings")).toEqual([{ pay_field: "EUR 90000–110000" }]);
      expect(
        rows(
          `select updated from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`,
        ),
      ).toEqual([{ updated: 0 }]);
    });
  });

  describe("the reopening time", () => {
    it("is null until the posting reopens, then the latest reopening", async () => {
      fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
      await runSource("jobicy");
      expect(rows("select reopened_at from collector_postings")).toEqual([{ reopened_at: null }]);

      const close = () => {
        db.db.run(sql`update collector_postings set status = 'closed', closed_at = ${now}`);
        db.db.run(sql`update collector_listings set status = 'closed', closed_at = ${now}`);
      };
      close();
      now = T0 + HOUR;
      await runSource("jobicy");
      expect(rows("select status, reopened_at from collector_postings")).toEqual([
        { status: "open", reopened_at: T0 + HOUR },
      ]);

      // Offered again while open: not a reopening.
      now = T0 + 2 * HOUR;
      await runSource("jobicy");
      expect(rows("select reopened_at from collector_postings")).toEqual([{ reopened_at: T0 + HOUR }]);

      close();
      now = T0 + 3 * HOUR;
      await runSource("jobicy");
      expect(rows("select reopened_at from collector_postings")).toEqual([{ reopened_at: T0 + 3 * HOUR }]);
    });

    it("a reopening by the collector carries the repost signal into the next list load (AC-08, review F-08)", async () => {
      fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
      await runSource("jobicy");
      const search: SearchDeps = { db: db.db, now: () => now };
      const list = () => runSearch(search, createSnapshotStore(search.now), "", "newest").items[0];
      openVisit(search);
      expect(list()?.realness?.signals ?? []).not.toContainEqual({ kind: "repost" });

      db.db.run(sql`update collector_postings set status = 'closed', closed_at = ${now}`);
      db.db.run(sql`update collector_listings set status = 'closed', closed_at = ${now}`);
      now = T0 + HOUR;
      await runSource("jobicy");
      expect(list()?.realness?.signals).toContainEqual({ kind: "repost" });
    });
  });
});
