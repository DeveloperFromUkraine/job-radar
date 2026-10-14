import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";

// applied-skipped spec §6 Durability: 100% of marks confirmed to the owner survive a restart.
describe("confirmed marks survive a restart", () => {
  let dir: string;
  let databaseFile: string;
  let app: FastifyInstance;
  let ids: string[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "job-radar-durable-"));
    databaseFile = join(dir, "job-radar.sqlite");
    const handle = openDb(databaseFile);
    runMigrations(handle.db);
    ids = seedOpenPostings(handle.db, 30);
    handle.close();
  });
  afterEach(async () => {
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const start = async () => {
    app = await buildApp({ port: 3000, collector: { databaseFile, scheduler: false } });
    await app.ready();
  };
  const post = (url: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { host: "127.0.0.1:3000" }, payload });

  it("keeps every confirmed mark out of the list after the app restarts", async () => {
    await start();
    const marked = ids.slice(0, 20);
    for (const [i, id] of marked.entries()) {
      const res = await post(`/api/v1/tracking/marks/${id}`, { mark: i % 2 ? "applied" : "skipped" });
      expect(res.statusCode).toBe(200); // confirmed
    }
    await app.close();

    await start();
    const list = (await post("/api/v1/search/snapshots", { skills: "" })).json();
    expect(list).toMatchObject({ total: 10, marked_count: 20 });
    const view = (await post("/api/v1/search/marked-snapshots", { skills: "" })).json();
    expect(view.items.map((p: { id: string }) => p.id).sort()).toEqual([...marked].sort());
  });
});
