import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { loadContract } from "./helpers/contract.js";

const contract = loadContract("realness-score");
const headers = { host: "127.0.0.1:3000" };

let dir: string;
let databaseFile: string;
let app: FastifyInstance;

async function start() {
  app = await buildApp({ port: 3000, collector: { databaseFile, scheduler: false } });
  await app.ready();
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-realness-"));
  databaseFile = join(dir, "job-radar.sqlite");
  const handle = openDb(databaseFile);
  runMigrations(handle.db);
  handle.close();
  await start();
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (extra: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: "/api/v1/realness/settings", headers: { ...headers, ...extra } });
const post = (payload: unknown, extra: Record<string, string> = {}) =>
  app.inject({
    method: "POST",
    url: "/api/v1/realness/settings",
    headers: { ...headers, ...extra },
    payload: payload as object,
  });

function sqlite<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(databaseFile);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
const rows = () => sqlite((db) => db.prepare("select id, realness_on from realness_settings").all());

describe("realness settings routes", () => {
  it("getRealnessSettings: on when never chosen, and reading creates nothing (AC-10)", async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    contract.expectContract("getRealnessSettings", 200, res.json());
    expect(res.json()).toEqual({ realness_on: true });
    expect(rows()).toEqual([]);
  });

  it("setRealnessOn: switches off and on, and saving the same state again is a no-op (AC-10)", async () => {
    const off = await post({ on: false });
    expect(off.statusCode).toBe(200);
    contract.expectContract("setRealnessOn", 200, off.json());
    expect(off.json()).toEqual({ realness_on: false });
    expect((await post({ on: false })).json()).toEqual({ realness_on: false });
    expect(rows()).toEqual([{ id: 1, realness_on: 0 }]);
    expect((await get()).json()).toEqual({ realness_on: false });
    expect((await post({ on: true })).json()).toEqual({ realness_on: true });
  });

  it("keeps the choice for the next opening, across a restart (AC-10)", async () => {
    await post({ on: false });
    await app.close();
    await start();
    expect((await get()).json()).toEqual({ realness_on: false });
  });

  it("a failed save is a 503 and leaves the stored choice as it was (AC-11)", async () => {
    await post({ on: false });
    sqlite((db) =>
      db.exec(`create trigger refuse before update on realness_settings begin select raise(abort, 'disk'); end;
               create trigger refuse_insert before insert on realness_settings begin select raise(abort, 'disk'); end;`),
    );
    const res = await post({ on: true });
    expect(res.statusCode).toBe(503);
    contract.expectContract("setRealnessOn", 503, res.json());
    expect(res.json().error).toEqual({
      code: "REALNESS_SETTINGS_UNAVAILABLE",
      message: "Job-radar could not save your realness choice just now. Try again.",
    });
    expect(rows()).toEqual([{ id: 1, realness_on: 0 }]);
  });

  it("a save whose switch read fails is the same 503, not a 500 (review F-05)", async () => {
    sqlite((db) => db.exec("alter table realness_settings rename to realness_settings_gone"));
    const res = await post({ on: true });
    expect(res.statusCode).toBe(503);
    contract.expectContract("setRealnessOn", 503, res.json());
    expect(res.json().error.code).toBe("REALNESS_SETTINGS_UNAVAILABLE");
  });

  it.each([[{ on: "no" }], [{}], [{ on: true, extra: 1 }]])(
    "refuses a malformed body %j with 400 VALIDATION_ERROR",
    async (body) => {
      const res = await post(body);
      expect(res.statusCode).toBe(400);
      contract.expectContract("setRealnessOn", 400, res.json());
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    },
  );

  it("rejects a non-JSON body with 415", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/realness/settings",
      headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
      payload: "on=false",
    });
    expect(res.statusCode).toBe(415);
    contract.expectContract("setRealnessOn", 415, res.json());
  });

  describe("nobody else can read or change the switch (AC-12)", () => {
    it.each([
      ["a foreign Host", { host: "evil.test" }],
      ["a cross-site page", { "sec-fetch-site": "cross-site" }],
    ])("refuses %s", async (_label, extra) => {
      const res = await post({ on: false }, extra);
      expect(res.statusCode).toBe(403);
      contract.expectContract("setRealnessOn", 403, res.json());
      expect(rows()).toEqual([]);
    });

    it("refuses a read from a foreign Host", async () => {
      const res = await get({ host: "evil.test" });
      expect(res.statusCode).toBe(403);
      contract.expectContract("getRealnessSettings", 403, res.json());
    });
  });
});
