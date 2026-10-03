import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { collectorModule } from "../src/modules/collector/index.js";
import { contractExample, expectContract } from "./helpers/contract.js";
import { type FakeSources, json, startFakeSources } from "./helpers/fake-sources.js";

const host = { host: "127.0.0.1:3000" };
const post = (app: FastifyInstance, payload: unknown = {}) =>
  app.inject({ method: "POST", url: "/api/v1/collector/runs", headers: host, payload: payload as object });

const delayed =
  (body: string, ms: number) => async (_req: unknown, res: import("node:http").ServerResponse) => {
    await new Promise((r) => setTimeout(r, ms));
    res.writeHead(200, { "content-type": "application/json" }).end(body);
  };

describe("collect now (Flow 2) and module wiring", () => {
  let dir: string;
  let databaseFile: string;
  let fake: FakeSources;
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "job-radar-collect-"));
    databaseFile = join(dir, "data", "job-radar.sqlite");
    mkdirSync(join(dir, "data"));
    const handle = openDb(databaseFile);
    runMigrations(handle.db);
    handle.close();
    fake = await startFakeSources();
    fake.route("/api/v2/remote-jobs", json(JSON.stringify({ hasMore: false, jobs: [] })));
    fake.route("/api/remote-jobs", json(JSON.stringify({ "job-count": 0, "total-job-count": 0, jobs: [] })));
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [], nextCursor: null })));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function start(options: { scheduler?: boolean; webDist?: string } = {}) {
    app = await buildApp({
      port: 3000,
      webDist: options.webDist,
      collector: { databaseFile, sourcesBaseUrl: fake.baseUrl, scheduler: options.scheduler ?? false },
    });
    await app.ready();
    return app;
  }
  const runs = () => {
    const handle = openDb(databaseFile);
    try {
      return handle.db.all<Record<string, unknown>>(sql`select trigger, status from collector_runs`);
    } finally {
      handle.close();
    }
  };
  const until = async (check: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error("timed out waiting");
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it("starts a run for every due source and answers with it (AC-15)", async () => {
    const a = await start();

    const res = await post(a);

    expect(res.statusCode).toBe(202);
    expectContract("collectNow", 202, res.json());
    expect(res.json()).toMatchObject({ started: true, run: { trigger: "collect_now", status: "running" } });
    expect(res.json().run.sources.map((s: { source_id: string }) => s.source_id)).toEqual([
      "jobicy",
      "himalayas",
      "remotive",
    ]);
    await until(() => runs().every((r) => r.status === "finished"));
  });

  it("starts no second run while one is in progress (AC-16)", async () => {
    fake.route("/api/v2/remote-jobs", delayed(JSON.stringify({ hasMore: false, jobs: [] }), 400));
    const a = await start();
    await post(a);

    const second = await post(a);

    expect(second.statusCode).toBe(409);
    expectContract("collectNow", 409, second.json());
    expect(second.json()).toEqual({
      error: { code: "COLLECTOR_RUN_IN_PROGRESS", message: "A collection run is already in progress." },
    });
    await until(() => runs().every((r) => r.status === "finished"));
    expect(runs()).toHaveLength(1);
  });

  it("starts no run and lists next due times when nothing may be read yet (AC-02, AC-15)", async () => {
    const a = await start();
    await post(a);
    await until(() => runs().every((r) => r.status === "finished"));

    const res = await post(a);

    expect(res.statusCode).toBe(200);
    expectContract("collectNow", 200, res.json());
    expect(res.json()).toMatchObject({ started: false, run: null });
    expect(res.json().next_due).toContainEqual({
      source_id: "weworkremotely",
      state: "disabled",
      next_due_at: null,
    });
  });

  it("refuses a body other than the empty object", async () => {
    const a = await start();
    const res = await post(a, { force: true });
    expect(res.statusCode).toBe(400);
    expectContract("collectNow", 400, res.json());
  });

  it("matches the contract's examples", () => {
    expectContract("collectNow", 202, contractExample("collectNow", 202));
    expectContract("collectNow", 200, contractExample("collectNow", 200));
  });

  it("starts the scheduler with the server — a catch-up run right away — and stops it on close (AC-18)", async () => {
    await start({ scheduler: true });
    await until(() => runs().length === 1);
    expect(runs()[0]).toMatchObject({ trigger: "catch_up" });
    await app?.close();
    app = undefined;
    await until(() => runs().every((r) => r.status !== "running"));
  });

  it("serves the built web app for client-side routes, and the error envelope for unknown API paths", async () => {
    const webDist = join(dir, "dist");
    mkdirSync(webDist);
    writeFileSync(join(webDist, "index.html"), "<!doctype html><title>job-radar</title>");
    const a = await start({ webDist });

    const page = await a.inject({ method: "GET", url: "/sources", headers: host });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("<title>job-radar</title>");

    const api = await a.inject({ method: "GET", url: "/api/v1/nope", headers: host });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe("NOT_FOUND");
  });
  it("closing the app aborts an in-flight read quickly, records no source failure, and leaves the run incomplete (AC-20)", async () => {
    fake.route("/api/v2/remote-jobs", delayed(JSON.stringify({ hasMore: false, jobs: [] }), 10_000));
    const a = await start();
    await post(a);
    await new Promise((r) => setTimeout(r, 100)); // the Jobicy read is now in flight

    const started = Date.now();
    await a.close();
    app = undefined;

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(runs()).toEqual([{ trigger: "collect_now", status: "incomplete" }]);
    const handle = openDb(databaseFile);
    try {
      expect(handle.db.all(sql`select outcome from collector_run_sources where outcome = 'failed'`)).toEqual(
        [],
      );
    } finally {
      handle.close();
    }
  }, 20_000);

  it("logs a run cut short by shutdown at info, never as a failed run (round-2 review R7)", async () => {
    const lines: { level: number; msg: string }[] = [];
    const stream = { write: (line: string) => void lines.push(JSON.parse(line)) };
    for (const path of ["/api/v2/remote-jobs", "/api/remote-jobs", "/jobs/api"]) {
      fake.route(path, delayed("{}", 5_000)); // every read is still in flight at shutdown
    }
    const bare = Fastify({ logger: { level: "info", stream } });
    await bare.register(collectorModule({ databaseFile, sourcesBaseUrl: fake.baseUrl, scheduler: false }));
    await bare.ready();
    const res = await bare.inject({ method: "POST", url: "/api/v1/collector/runs", payload: {} });
    expect(res.statusCode).toBe(202);

    await bare.close();

    const about = lines.filter((l) => /run (failed|interrupted)/.test(l.msg));
    expect(about).toEqual([expect.objectContaining({ level: 30, msg: "run interrupted by shutdown" })]);
  });
});
