import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { collectorRoutes } from "../src/modules/collector/ports/routes.js";
import { contractExample, expectContract } from "./helpers/contract.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 2, 12);
const host = { host: "127.0.0.1:3000" };

describe("collector read routes (Flow 10)", () => {
  let db: TempDb;
  let dir: string;
  let app: FastifyInstance;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(async () => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-health-"));
    now = T0;
    deps = {
      db: db.db,
      now: () => now,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: "http://127.0.0.1:1" }),
      timeZone: "Europe/Warsaw",
    };
    startUp(deps);
    app = await buildApp({ port: 3000 });
    await app.register(collectorRoutes(deps));
  });

  afterEach(async () => {
    await app.close();
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = async (path: string, operationId: string) => {
    const res = await app.inject({ method: "GET", url: `/api/v1/collector/${path}`, headers: host });
    expectContract(operationId, res.statusCode, res.json());
    return res;
  };
  const exec = (q: ReturnType<typeof sql>) => db.db.run(q);

  it("reports no problem and nothing collected yet on a fresh start (AC-12 Given)", async () => {
    const problems = await get("problems", "getCollectorProblems");
    expect(problems.json()).toEqual({ has_problem: false, problems: [] });

    const health = (await get("source-health", "getSourceHealth")).json();
    expect(health.any_run_finished).toBe(false);
    expect(health.current_run).toBeNull();
    expect(health.sources.map((s: { source_id: string; state: string }) => [s.source_id, s.state])).toEqual([
      ["jobicy", "enabled"],
      ["himalayas", "enabled"],
      ["remotive", "enabled"],
      ["weworkremotely", "enabled"],
    ]);
    expect(health.sources[0].next_due_at).toBe(new Date(T0).toISOString());
  });

  it("lists every flag that can cost postings, but not a category notice (AC-13 note)", async () => {
    exec(sql`insert into collector_source_flags (source_id, kind, reason, raised_at) values
      ('remotive', 'failing', 'Failed on the last 2 due runs - the source could not be reached.', ${T0}),
      ('himalayas', 'category_unmatched', 'Category "Data Science" matched nothing at the source.', ${T0})`);

    expect((await get("problems", "getCollectorProblems")).json()).toEqual({
      has_problem: true,
      problems: [{ source_id: "remotive", kind: "failing" }],
    });
    const health = (await get("source-health", "getSourceHealth")).json();
    const himalayas = health.sources.find((s: { source_id: string }) => s.source_id === "himalayas");
    expect(himalayas.flags).toEqual([
      {
        kind: "category_unmatched",
        reason: 'Category "Data Science" matched nothing at the source.',
        raised_at: new Date(T0).toISOString(),
        raises_marker: false,
      },
    ]);
  });

  it("only a category notice shows no main-screen problem", async () => {
    exec(sql`insert into collector_source_flags (source_id, kind, reason, raised_at)
      values ('himalayas', 'category_unmatched', 'x', ${T0})`);
    expect((await get("problems", "getCollectorProblems")).json()).toEqual({
      has_problem: false,
      problems: [],
    });
  });

  it("raises overdue at read time from the app's running time (AC-13)", async () => {
    exec(sql`update collector_sources set last_read_at = ${T0 - 3 * HOUR} where id = 'jobicy'`);
    exec(sql`update collector_app_sessions set started_at = ${T0 - 4 * HOUR}, last_seen_at = ${T0}`);

    expect((await get("problems", "getCollectorProblems")).json().problems).toContainEqual({
      source_id: "jobicy",
      kind: "overdue",
    });
    const jobicy = (await get("source-health", "getSourceHealth")).json().sources[0];
    expect(jobicy.flags).toEqual([
      {
        kind: "overdue",
        reason: "Not read for 3 h while the app was running - it is due every 1 h.",
        raised_at: null,
        raises_marker: true,
      },
    ]);
  });

  it("reports an unreadable settings file as a problem with its reason (AC-27)", async () => {
    writeFileSync(deps.settingsFile, "{ nope");
    openRun(deps, "schedule"); // the run start reads the file

    expect((await get("problems", "getCollectorProblems")).json().problems).toContainEqual({
      source_id: null,
      kind: "settings_unreadable",
    });
    expect((await get("source-health", "getSourceHealth")).json().settings).toEqual({
      notice: null,
      problem: "The settings file is not valid JSON.",
      problem_since: new Date(T0).toISOString(),
      running_on: "defaults", // no valid copy yet on a first start (review A8)
    });
  });

  it("shows the run in progress and each source's last outcome and counts (AC-12)", async () => {
    exec(sql`insert into collector_runs (id, trigger, status, started_at, finished_at)
      values ('01920000-0000-7000-8000-000000000001', 'schedule', 'finished', ${T0 - HOUR}, ${T0 - HOUR + MIN})`);
    exec(sql`insert into collector_run_sources (run_id, source_id, outcome, items_returned, new_listings, unknown_location_new,
        added, updated, closed, held, no_category, fetch_finished_at)
      values ('01920000-0000-7000-8000-000000000001', 'jobicy', 'complete', 12, 4, 1, 4, 1, 2, 0, 3, ${T0 - HOUR})`);
    exec(
      sql`update collector_sources set last_success_at = ${T0 - HOUR}, last_read_at = ${T0 - HOUR} where id = 'jobicy'`,
    );
    now = T0 + 5 * MIN;
    openRun(deps, "collect_now");

    const health = (await get("source-health", "getSourceHealth")).json();

    expect(health.any_run_finished).toBe(true);
    expect(health.current_run).toMatchObject({ trigger: "collect_now", status: "running" });
    expect(health.last_run).toMatchObject({ id: "01920000-0000-7000-8000-000000000001", status: "finished" });
    const jobicy = health.sources[0];
    expect(jobicy.last_success_at).toBe(new Date(T0 - HOUR).toISOString());
    expect(jobicy.last_outcome).toEqual({
      source_id: "jobicy",
      outcome: "complete",
      failure_reason: null,
      counts: { added: 4, updated: 1, closed: 2, held: 0, no_category: 3 },
      fetch_finished_at: new Date(T0 - HOUR).toISOString(),
    });
    // Remotive is being read in the current run → no next-due time.
    expect(health.sources[2].next_due_at).toBeNull();
  });

  it("reports reads in the rolling windows and the freshness p90", async () => {
    exec(sql`insert into collector_request_ledger (id, source_id, sent_at) values
      ('a', 'jobicy', ${T0 - 30 * MIN}), ('b', 'jobicy', ${T0 - 5 * HOUR})`);
    exec(sql`insert into collector_postings (id, match_key, title, company, first_found_at, status, last_offered_at)
      values ('p', 'k', 'T', 'C', 0, 'open', 0)`);
    exec(sql`update collector_app_sessions set started_at = ${T0 - 48 * HOUR}, last_seen_at = ${T0}`);
    for (let i = 0; i < 10; i++) {
      exec(sql`insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company, description,
          categories, published_at, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status)
        values (${`l${i}`}, 'p', 'jobicy', ${`i${i}`}, 'u', 'T', 'C', '', '[]', ${T0 - 10 * HOUR},
          ${T0 - 10 * HOUR + (i + 1) * 30 * MIN}, 0, 0, 'r', 'open')`);
    }
    exec(sql`insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company, description,
        categories, published_at, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status)
      values ('nodate', 'p', 'jobicy', 'nd', 'u', 'T', 'C', '', '[]', null, ${T0}, 0, 0, 'r', 'open')`);

    const jobicy = (await get("source-health", "getSourceHealth")).json().sources[0];

    expect(jobicy.reads).toEqual({ last_60_min: 1, last_24_h: 2 });
    expect(jobicy.freshness).toEqual({ p90_minutes: 270, sample_size: 10, without_publication_time: 1 });
  });

  it("the contract has an example with a limited fill and a settings fallback (round-2 review R10)", () => {
    const example = contractExample("getSourceHealth", 200, "settings_fallback") as {
      settings: { running_on: string };
      sources: { fill: { status: string } }[];
    };
    expectContract("getSourceHealth", 200, example);
    expect(example.settings.running_on).toBe("defaults");
    expect(example.sources.some((s) => s.fill.status === "limited")).toBe(true);
  });

  it("matches the contract's own examples (the web app's mocks)", () => {
    expectContract("getSourceHealth", 200, contractExample("getSourceHealth", 200, "collected"));
    expectContract("getCollectorProblems", 200, contractExample("getCollectorProblems", 200, "problem"));
  });
  it("measures overdue from the last successful read with items, not from a failed attempt (AC-13)", async () => {
    exec(sql`insert into collector_runs (id, trigger, status, started_at, finished_at) values
      ('01920000-0000-7000-8000-0000000000a1', 'schedule', 'finished', ${T0 - 4 * HOUR}, ${T0 - 4 * HOUR}),
      ('01920000-0000-7000-8000-0000000000a2', 'schedule', 'finished', ${T0 - 30 * MIN}, ${T0 - 30 * MIN})`);
    exec(sql`insert into collector_run_sources (run_id, source_id, outcome, failure_reason, items_returned, new_listings,
        unknown_location_new, added, updated, closed, held, no_category, fetch_finished_at) values
      ('01920000-0000-7000-8000-0000000000a1', 'jobicy', 'complete', null, 5, 0, 0, 0, 0, 0, 0, 0, ${T0 - 4 * HOUR}),
      ('01920000-0000-7000-8000-0000000000a2', 'jobicy', 'failed', 'x', null, 0, 0, 0, 0, 0, 0, 0, null)`);
    exec(sql`update collector_sources set last_read_at = ${T0 - 30 * MIN} where id = 'jobicy'`);
    exec(sql`update collector_app_sessions set started_at = ${T0 - 5 * HOUR}, last_seen_at = ${T0}`);

    expect((await get("problems", "getCollectorProblems")).json().problems).toContainEqual({
      source_id: "jobicy",
      kind: "overdue",
    });
    const jobicy = (await get("source-health", "getSourceHealth")).json().sources[0];
    expect(jobicy.flags[0].reason).toBe(
      "No successful read with items for 4 h while the app was running - it is due every 1 h.",
    );
  });

  it("does not raise the marker for flags of a source that is no longer read (AC-26)", async () => {
    writeFileSync(
      deps.settingsFile,
      JSON.stringify({ sources: { remotive: { enabled: false, categories: [] } } }),
    );
    openRun(deps, "schedule"); // the run start reads the settings
    exec(sql`insert into collector_source_flags (source_id, kind, reason, raised_at)
      values ('remotive', 'failing', 'Failed on the last 2 due runs.', ${T0})`);

    expect((await get("problems", "getCollectorProblems")).json()).toEqual({
      has_problem: false,
      problems: [],
    });
  });
  it("says collection runs on the last valid copy when one exists (AC-27, review A8)", async () => {
    writeFileSync(deps.settingsFile, JSON.stringify({ sources: {} }));
    openRun(deps, "schedule");
    exec(sql`update collector_runs set status = 'finished'`);
    writeFileSync(deps.settingsFile, "{ nope");
    now = T0 + 7 * HOUR;
    openRun(deps, "schedule");

    expect((await get("source-health", "getSourceHealth")).json().settings).toMatchObject({
      problem: "The settings file is not valid JSON.",
      running_on: "last_valid",
    });
  });
});
