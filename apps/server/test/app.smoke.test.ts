import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { startFakeSources } from "./helpers/fake-sources.js";

describe("server skeleton", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("boots on a real port and answers GET /health", async () => {
    app = await buildApp();
    const address = await app.listen({ host: "127.0.0.1", port: 0 });

    const res = await fetch(`${address}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
  it("answers within 5 s of start while the catch-up run works (spec §6)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "job-radar-smoke-"));
    mkdirSync(join(dir, "data"));
    const databaseFile = join(dir, "data", "job-radar.sqlite");
    const handle = openDb(databaseFile);
    runMigrations(handle.db);
    handle.close();
    const fake = await startFakeSources();
    // Every source takes 5.5 s to answer, so the catch-up run is still working when we ask.
    const slow = (body: string) => async (_req: unknown, res: import("node:http").ServerResponse) => {
      await new Promise((r) => setTimeout(r, 5500));
      res.writeHead(200, { "content-type": "application/json" }).end(body);
    };
    fake.route("/api/v2/remote-jobs", slow('{"hasMore":false,"jobs":[]}'));
    fake.route("/api/remote-jobs", slow('{"job-count":0,"total-job-count":0,"jobs":[]}'));
    fake.route("/jobs/api", slow('{"jobs":[]}'));
    try {
      const started = Date.now();
      app = await buildApp({ collector: { databaseFile, sourcesBaseUrl: fake.baseUrl } });
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const res = await fetch(`${address}/api/v1/collector/source-health`);
      const body = (await res.json()) as { current_run: unknown };

      expect(res.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(5000);
      expect(body.current_run).toMatchObject({ trigger: "catch_up", status: "running" });
    } finally {
      await app?.close();
      app = undefined;
      await fake.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
