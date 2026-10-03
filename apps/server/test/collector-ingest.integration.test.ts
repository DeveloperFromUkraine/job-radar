import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { ingestSource } from "../src/modules/collector/app/ingest.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { type FakeSources, fixture, json, startFakeSources } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

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
const remotivePage = (jobs: object[]) =>
  JSON.stringify({ "job-count": jobs.length, "total-job-count": jobs.length, jobs });

describe("ingest one due source (Flows 5 and 6)", () => {
  let db: TempDb;
  let dir: string;
  let fake: FakeSources;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(async () => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-ingest-"));
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
    const verdict = await ingestSource(deps, run, sourceId);
    finish();
    return { run, verdict };
  }

  it("stores a new tech listing as a posting with title, company, time, source and link (AC-01)", async () => {
    fake.route("/api/v2/remote-jobs", json(fixture("jobicy/complete.json")));

    const { run, verdict } = await runSource("jobicy");

    expect(verdict).toEqual({
      sourceId: "jobicy",
      completeness: "complete",
      coversPublishedAfter: expect.any(Number),
      nextCursor: null,
    });
    expect(
      rows("select title, company, published_at, status from collector_postings order by title"),
    ).toEqual([
      {
        title: "DevOps Engineer (Remote)",
        company: "Sample Labs Inc.",
        published_at: Date.parse("2026-10-02T08:30:00Z"),
        status: "open",
      },
      {
        title: "Senior Backend Engineer",
        company: "Example Co",
        published_at: Date.parse("2026-10-02T10:00:00Z"),
        status: "open",
      },
    ]);
    expect(
      rows("select source_id, url, location_restriction, description from collector_listings order by url"),
    ).toEqual([
      {
        source_id: "jobicy",
        url: "https://jobs.example.test/jobicy/900002",
        location_restriction: null,
        description: "Build & ship APIs.",
      },
      {
        source_id: "jobicy",
        url: "https://jobs.example.test/jobicy/900003",
        location_restriction: "Europe",
        description: "Build & ship APIs.",
      },
    ]);
    expect(
      rows(`select * from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`),
    ).toEqual([
      expect.objectContaining({
        source_id: "jobicy",
        outcome: "complete",
        items_returned: 3,
        new_listings: 2,
        unknown_location_new: 1,
        added: 2,
        updated: 0,
        no_category: 0,
        fetch_finished_at: T0,
      }),
    ]);
    expect(
      rows("select last_success_at, first_success_at from collector_sources where id = 'jobicy'"),
    ).toEqual([{ last_success_at: T0, first_success_at: T0 }]);
  });

  it("merges the same role from another source into one posting naming both (AC-04)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
    fake.route(
      "/api/remote-jobs",
      json(
        remotivePage([
          {
            id: 1,
            url: "https://jobs.example.test/remotive/1",
            title: "Senior Backend Engineer (Remote)",
            company_name: "Example Co Inc.",
            category: "Software Development",
            publication_date: "2026-10-01T09:00:00",
            candidate_required_location: "",
            description: "",
          },
        ]),
      ),
    );
    await runSource("jobicy");
    const firstFound = rows("select first_found_at from collector_postings")[0];
    now = T0 + 7 * HOUR;

    const { run } = await runSource("remotive");

    expect(rows("select count(*) as n from collector_postings")).toEqual([{ n: 1 }]);
    expect(rows("select source_id from collector_listings order by source_id")).toEqual([
      { source_id: "jobicy" },
      { source_id: "remotive" },
    ]);
    expect(rows("select published_at from collector_postings")).toEqual([
      { published_at: Date.UTC(2026, 9, 1, 9) },
    ]);
    expect(rows("select first_found_at from collector_postings")[0]).toEqual(firstFound); // AC-06
    expect(
      rows(
        `select added, updated from collector_run_sources where run_id = '${run.runId}' and source_id = 'remotive'`,
      ),
    ).toEqual([{ added: 0, updated: 1 }]);
  });

  it("records a failing source with a plain reason and stores nothing from it (AC-03)", async () => {
    fake.route("/api/remote-jobs", json("{}", 500));

    const { run, verdict } = await runSource("remotive");

    expect(verdict.completeness).toBe("failed");
    expect(
      rows(
        `select outcome, failure_reason, fetch_finished_at from collector_run_sources where run_id = '${run.runId}' and source_id = 'remotive'`,
      ),
    ).toEqual([
      { outcome: "failed", failure_reason: "The source could not be reached.", fetch_finished_at: null },
    ]);
    expect(rows("select last_success_at from collector_sources where id = 'remotive'")).toEqual([
      { last_success_at: null },
    ]);
  });

  it("replaces a changed location statement without re-deciding the merge (AC-21)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
    await runSource("jobicy");
    const postingId = rows("select id from collector_postings")[0]?.id;
    fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob({ jobGeo: "Poland" })])));
    now = T0 + HOUR;

    const { run } = await runSource("jobicy");

    expect(rows("select posting_id, location_restriction from collector_listings")).toEqual([
      { posting_id: postingId, location_restriction: "Poland" },
    ]);
    expect(
      rows(
        `select updated, new_listings from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`,
      ),
    ).toEqual([{ updated: 1, new_listings: 0 }]);
  });

  it("does not count a listing seen again unchanged as updated", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
    await runSource("jobicy");
    now = T0 + HOUR;
    const { run } = await runSource("jobicy");
    expect(
      rows(
        `select added, updated from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`,
      ),
    ).toEqual([{ added: 0, updated: 0 }]);
  });

  it("replaces the same source's old item when it re-posts the role, without a closure (AC-04)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
    await runSource("jobicy");
    const postingId = rows("select id from collector_postings")[0]?.id;
    fake.route(
      "/api/v2/remote-jobs",
      json(jobicyPage([jobicyJob({ id: 900099, url: "https://jobs.example.test/jobicy/900099" })])),
    );
    now = T0 + HOUR;

    await runSource("jobicy");

    expect(rows("select posting_id, source_item_id, status from collector_listings")).toEqual([
      { posting_id: postingId, source_item_id: "900099", status: "open" },
    ]);
  });

  it("reopens a closed posting under the same id when its item is offered again (AC-11)", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
    await runSource("jobicy");
    db.db.run(sql`update collector_postings set status = 'closed', closed_at = ${T0}`);
    db.db.run(sql`update collector_listings set status = 'closed', closed_at = ${T0}`);
    now = T0 + HOUR;

    const { run } = await runSource("jobicy");

    expect(rows("select status, closed_at from collector_postings")).toEqual([
      { status: "open", closed_at: null },
    ]);
    expect(rows("select status from collector_listings")).toEqual([{ status: "open" }]);
    expect(
      rows(
        `select updated from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`,
      ),
    ).toEqual([{ updated: 1 }]);
  });

  it("drops listings outside the owner's categories and counts those without one (AC-23)", async () => {
    fake.route(
      "/api/v2/remote-jobs",
      json(
        jobicyPage([
          jobicyJob({ id: 1, jobIndustry: ["Marketing &amp; Sales"] }),
          jobicyJob({ id: 2, jobIndustry: [] }),
          jobicyJob({ id: 3, jobIndustry: ["Marketing &amp; Sales", "Software Engineering"] }),
        ]),
      ),
    );
    const { run } = await runSource("jobicy");
    expect(rows("select source_item_id from collector_listings")).toEqual([{ source_item_id: "3" }]);
    expect(
      rows(
        `select no_category, items_returned from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`,
      ),
    ).toEqual([{ no_category: 1, items_returned: 3 }]);
  });

  it("ends as partial, not failed, when the source's window is already used up", async () => {
    fake.route("/api/v2/remote-jobs", json(jobicyPage([jobicyJob()])));
    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error("no run");
    await ingestSource(deps, run, "jobicy");
    const again = await ingestSource(deps, run, "jobicy"); // second read inside the same hour

    expect(again.completeness).toBe("partial");
    expect(DEFAULT_SETTINGS.sources.jobicy.enabled).toBe(true);
  });
  it("keeps two live same-title roles at one source apart and stable across runs (AC-05)", async () => {
    const page = jobicyPage([
      jobicyJob({ id: 1, url: "https://jobs.example.test/jobicy/1", jobGeo: "USA" }),
      jobicyJob({ id: 2, url: "https://jobs.example.test/jobicy/2", jobGeo: "Germany" }),
    ]);
    fake.route("/api/v2/remote-jobs", json(page));
    await runSource("jobicy");
    now = T0 + HOUR;

    const { run } = await runSource("jobicy");

    expect(rows("select location_restriction from collector_listings order by location_restriction")).toEqual(
      [{ location_restriction: "Germany" }, { location_restriction: "USA" }],
    );
    expect(rows("select count(*) as n from collector_postings")).toEqual([{ n: 2 }]);
    expect(
      rows(
        `select updated, new_listings from collector_run_sources where run_id = '${run.runId}' and source_id = 'jobicy'`,
      ),
    ).toEqual([{ updated: 0, new_listings: 0 }]);
  });
  it("a capped read never replaces a live same-title role it merely did not return (AC-05, review R1)", async () => {
    const job = (n: number, place: string) => ({
      guid: `https://jobs.example.test/himalayas/${n}`,
      title: "Senior Backend Engineer",
      companyName: "Example Co",
      parentCategories: ["Developer"],
      locationRestrictions: [place],
      timezoneRestrictions: [],
      pubDate: Math.floor((T0 - n * HOUR) / 1000),
      expiryDate: Math.floor((T0 + 30 * 24 * HOUR) / 1000),
    });
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [job(2, "Germany")], nextCursor: null })));
    await runSource("himalayas");
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [job(1, "USA")], nextCursor: null })));
    now = T0 + 6 * HOUR;

    await runSource("himalayas");

    expect(rows("select location_restriction from collector_listings order by location_restriction")).toEqual(
      [{ location_restriction: "Germany" }, { location_restriction: "USA" }],
    );
    expect(rows("select count(*) as n from collector_postings")).toEqual([{ n: 2 }]);
  });

  it("a re-post with a conflicting stated location never takes over the gone item's posting (AC-05, review S1)", async () => {
    const remotiveJob = (id: number, place: string) => ({
      id,
      url: `https://jobs.example.test/remotive/${id}`,
      title: "Senior Backend Engineer",
      company_name: "Example Co",
      category: "Software Development",
      publication_date: "2026-10-02T09:00:00",
      candidate_required_location: place,
      description: "",
    });
    fake.route("/api/remote-jobs", json(remotivePage([remotiveJob(1, "United States")])));
    await runSource("remotive");
    fake.route("/api/remote-jobs", json(remotivePage([remotiveJob(2, "Germany")])));
    now = T0 + 24 * HOUR;

    await runSource("remotive"); // complete fetch: item 1 is proven gone, but the locations conflict

    expect(
      rows("select source_item_id, location_restriction from collector_listings order by source_item_id").map(
        (r) => [r.source_item_id, r.location_restriction],
      ),
    ).toEqual([
      ["1", "United States"],
      ["2", "Germany"],
    ]);
    expect(rows("select count(*) as n from collector_postings")).toEqual([{ n: 2 }]);
  });

  it("on a capped read, a re-post replaces an old item that is already closed (AC-04, AC-11, review M1)", async () => {
    const job = (n: number) => ({
      guid: `https://jobs.example.test/himalayas/${n}`,
      title: "Senior Backend Engineer",
      companyName: "Example Co",
      parentCategories: ["Developer"],
      locationRestrictions: ["Germany"],
      timezoneRestrictions: [],
      pubDate: Math.floor((T0 - n * HOUR) / 1000),
      expiryDate: Math.floor((T0 + 30 * 24 * HOUR) / 1000),
    });
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [job(2)], nextCursor: null })));
    await runSource("himalayas");
    db.db.run(sql`update collector_listings set status = 'closed', closed_at = ${T0 + HOUR}`);
    db.db.run(sql`update collector_postings set status = 'closed', closed_at = ${T0 + HOUR}`);
    const postingId = rows("select id from collector_postings")[0]?.id;
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [job(1)], nextCursor: null })));
    now = T0 + 6 * HOUR;

    await runSource("himalayas");

    expect(rows("select posting_id, source_item_id, status from collector_listings")).toEqual([
      { posting_id: postingId, source_item_id: "https://jobs.example.test/himalayas/1", status: "open" },
    ]);
    expect(rows("select id, status from collector_postings")).toEqual([{ id: postingId, status: "open" }]);
  });
});
