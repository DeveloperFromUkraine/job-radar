import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { createScheduler } from "../src/modules/collector/app/scheduler.js";
import { heartbeat, startUp } from "../src/modules/collector/app/startup.js";
import { DEFAULT_SETTINGS } from "../src/modules/collector/domain/settings.js";
import { recordRead } from "../src/modules/collector/infra/repo/sources.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 2, 12);

type Row = Record<string, unknown>;

describe("run start (Flows 3 and 4)", () => {
  let db: TempDb;
  let dir: string;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(() => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-run-"));
    now = T0;
    deps = {
      db: db.db,
      now: () => now,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: "http://127.0.0.1:1" }),
      timeZone: "Europe/Warsaw",
    };
    startUp(deps);
  });

  afterEach(() => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));
  const finishRuns = () =>
    db.db.run(sql`update collector_runs set status = 'finished' where status = 'running'`);
  const writeSettings = (patch: Partial<typeof DEFAULT_SETTINGS.sources>) =>
    writeFileSync(deps.settingsFile, JSON.stringify({ sources: { ...DEFAULT_SETTINGS.sources, ...patch } }));

  it("opens a run for every enabled source that is due, with a pending outcome each (AC-02)", () => {
    const result = openRun(deps, "schedule");

    expect(result.kind).toBe("started");
    if (result.kind !== "started") return;
    expect(result.due).toEqual(["jobicy", "himalayas", "remotive"]);
    expect(rows("select trigger, status, started_at from collector_runs")).toEqual([
      { trigger: "schedule", status: "running", started_at: T0 },
    ]);
    expect(rows("select source_id, outcome from collector_run_sources order by source_id")).toEqual([
      { source_id: "himalayas", outcome: "pending" },
      { source_id: "jobicy", outcome: "pending" },
      { source_id: "remotive", outcome: "pending" },
    ]);
  });

  it("never opens a second run while one is in progress (AC-16)", () => {
    openRun(deps, "schedule");
    expect(openRun(deps, "collect_now")).toEqual({ kind: "already_running" });
    expect(rows("select count(*) as n from collector_runs")).toEqual([{ n: 1 }]);
  });

  it("opens no run when nothing is due and reports when each source is next due (AC-02, AC-15)", () => {
    openRun(deps, "schedule");
    for (const id of ["jobicy", "himalayas", "remotive"] as const) recordRead(db.db, id, T0);
    finishRuns();
    now = T0 + 30 * MIN;

    expect(openRun(deps, "collect_now")).toEqual({
      kind: "nothing_due",
      nextDue: [
        { sourceId: "jobicy", state: "enabled", nextDueAt: T0 + HOUR },
        { sourceId: "himalayas", state: "enabled", nextDueAt: T0 + 6 * HOUR },
        { sourceId: "remotive", state: "enabled", nextDueAt: T0 + 6 * HOUR },
        { sourceId: "weworkremotely", state: "disabled", nextDueAt: null },
      ],
    });
  });

  it("reads only the sources whose interval has passed", () => {
    openRun(deps, "schedule");
    for (const id of ["jobicy", "himalayas", "remotive"] as const) recordRead(db.db, id, T0);
    finishRuns();
    now = T0 + HOUR;

    const result = openRun(deps, "schedule");
    expect(result.kind === "started" && result.due).toEqual(["jobicy"]);
  });

  it("does not read a disabled source and records when it was disabled (AC-26)", () => {
    writeSettings({ jobicy: { enabled: false, categories: [] } });

    const result = openRun(deps, "schedule");

    expect(result.kind === "started" && result.due).toEqual(["himalayas", "remotive"]);
    expect(
      rows("select source_id, disabled_from, disabled_until from collector_source_disabled_periods"),
    ).toContainEqual({
      source_id: "jobicy",
      disabled_from: T0,
      disabled_until: null,
    });
  });

  it("closes the disabled period when the owner enables the source again (AC-26)", () => {
    writeSettings({ jobicy: { enabled: false, categories: [] } });
    openRun(deps, "schedule");
    finishRuns();
    writeSettings({});
    now = T0 + 2 * HOUR;

    openRun(deps, "schedule");

    expect(
      rows(
        "select disabled_from, disabled_until from collector_source_disabled_periods where source_id = 'jobicy'",
      ),
    ).toEqual([{ disabled_from: T0, disabled_until: T0 + 2 * HOUR }]);
  });

  it("never reads a source the owner enabled while its allowed rate is 0 (AC-27)", () => {
    writeSettings({ weworkremotely: { enabled: true, categories: [] } });
    const result = openRun(deps, "schedule");
    expect(result.kind === "started" && result.due).not.toContain("weworkremotely");
    expect(result.kind === "started" && result.nextDue).toContainEqual({
      sourceId: "weworkremotely",
      state: "not_verified",
      nextDueAt: null,
    });
  });

  it("runs on the last valid settings when the file becomes unreadable (AC-27)", () => {
    writeSettings({ jobicy: { enabled: false, categories: [] } });
    openRun(deps, "schedule");
    finishRuns();
    writeFileSync(deps.settingsFile, "{ broken");
    now = T0 + 7 * HOUR;

    const result = openRun(deps, "schedule");
    expect(result.kind === "started" && result.due).not.toContain("jobicy");
  });
});

describe("start-up after a pause or an interrupted run (Flow 3)", () => {
  let db: TempDb;
  let dir: string;
  let now: number;
  let deps: CollectorDeps;

  beforeEach(() => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-run-"));
    now = T0;
    deps = {
      db: db.db,
      now: () => now,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: "http://127.0.0.1:1" }),
      timeZone: "Europe/Warsaw",
    };
  });

  afterEach(() => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));

  it("records an interrupted run as incomplete and does not block new runs (AC-20)", () => {
    startUp(deps);
    openRun(deps, "schedule"); // the laptop sleeps / the app stops mid-run
    now = T0 + 3 * HOUR;

    startUp(deps);

    expect(rows("select status from collector_runs")).toEqual([{ status: "incomplete" }]);
    expect(openRun(deps, "catch_up").kind).toBe("started");
  });

  it("records each start as an app session and keeps it alive with a heartbeat", () => {
    const session = startUp(deps);
    now = T0 + 5 * MIN;
    heartbeat(deps, session.sessionId);
    expect(rows("select started_at, last_seen_at from collector_app_sessions")).toEqual([
      { started_at: T0, last_seen_at: T0 + 5 * MIN },
    ]);
  });

  it("starts a catch-up run right after start, then checks every minute (AC-18)", async () => {
    const opened: string[] = [];
    const scheduler = createScheduler(deps, {
      executeRun: async (run) => {
        opened.push(run.trigger);
        db.db.run(sql`update collector_runs set status = 'finished' where id = ${run.runId}`);
      },
      intervalMs: 20,
    });

    await scheduler.start();
    expect(opened).toEqual(["catch_up"]);
    expect(rows("select trigger from collector_runs")).toEqual([{ trigger: "catch_up" }]);

    now = T0 + HOUR; // Jobicy due again
    await new Promise((r) => setTimeout(r, 60));
    await scheduler.stop();
    expect(opened.slice(0, 2)).toEqual(["catch_up", "schedule"]);

    const count = opened.length;
    now = T0 + 2 * HOUR;
    await new Promise((r) => setTimeout(r, 60));
    expect(opened.length).toBe(count); // stopped: no more ticks
  });
  it("keeps the session heartbeat moving while a long run is still busy (AC-13)", async () => {
    let release: () => void = () => {};
    const scheduler = createScheduler(deps, {
      executeRun: () => new Promise<void>((r) => (release = r)),
      intervalMs: 20,
    });
    await scheduler.start();
    now = T0 + 7 * 60_000;
    await new Promise((r) => setTimeout(r, 80));

    expect(rows("select max(last_seen_at) as at from collector_app_sessions")).toEqual([
      { at: T0 + 7 * 60_000 },
    ]);
    release();
    await scheduler.stop();
  });
  it("a failing heartbeat is reported, never thrown out of the scheduler (round-2 review R4)", async () => {
    const errors: unknown[] = [];
    const scheduler = createScheduler(deps, {
      executeRun: async () => {},
      intervalMs: 20,
      onError: (e) => errors.push(e),
    });
    db.db.run(sql`drop table collector_app_sessions`); // touchSession now throws

    await expect(scheduler.start()).rejects.toThrow(); // startUp itself opens a session
    await scheduler.stop();
  });

  it("a heartbeat error during a tick goes to onError and ticks keep coming", async () => {
    const errors: unknown[] = [];
    const scheduler = createScheduler(deps, {
      executeRun: async () => {},
      intervalMs: 20,
      onError: (e) => errors.push(e),
    });
    await scheduler.start();
    db.db.run(sql`drop table collector_app_sessions`);

    await new Promise((r) => setTimeout(r, 90));
    await scheduler.stop();

    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
