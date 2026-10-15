import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { loadContract } from "./helpers/contract.js";

const contract = loadContract("remote-filter");
const headers = { host: "127.0.0.1:3000" };
const PL = { code: "PL", name: "Poland", flag: "🇵🇱" };
const DE = { code: "DE", name: "Germany", flag: "🇩🇪" };

let dir: string;
let databaseFile: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-remote-filter-"));
  databaseFile = join(dir, "job-radar.sqlite");
  const handle = openDb(databaseFile);
  runMigrations(handle.db);
  handle.close();
  app = await buildApp({ port: 3000, collector: { databaseFile, scheduler: false } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (extra: Record<string, string> = {}) =>
  app.inject({ method: "GET", url: "/api/v1/remote-filter/settings", headers: { ...headers, ...extra } });
const post = (path: string, payload: unknown, extra: Record<string, string> = {}) =>
  app.inject({
    method: "POST",
    url: `/api/v1/remote-filter/${path}`,
    headers: { ...headers, ...extra },
    payload: payload as object,
  });

function row() {
  const db = new Database(databaseFile, { readonly: true });
  try {
    return db.prepare("select country, filter_on, look_country from remote_filter_settings").all();
  } finally {
    db.close();
  }
}

describe("remote-filter routes", () => {
  it("getRemoteFilterSettings: no country, filter on, the country list (AC-04)", async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    contract.expectContract("getRemoteFilterSettings", 200, res.json());
    expect(res.json()).toMatchObject({ country: null, filter_on: true });
    expect(res.json().countries).toContainEqual(PL);
  });

  it("chooseCountry: saves and switches on (AC-04, AC-13)", async () => {
    await post("filter", { on: false });
    const res = await post("country", { name: "poland" });
    expect(res.statusCode).toBe(200);
    contract.expectContract("chooseCountry", 200, res.json());
    expect(res.json()).toMatchObject({ country: PL, filter_on: true });
    expect((await get()).json()).toMatchObject({ country: PL, filter_on: true });
  });

  it.each(["Polnd", "Europe"])(
    "chooseCountry refuses %j and keeps the saved country (AC-05)",
    async (name) => {
      await post("country", { name: "Poland" });
      const res = await post("country", { name });
      expect(res.statusCode).toBe(400);
      contract.expectContract("chooseCountry", 400, res.json());
      expect(res.json().error).toEqual({
        code: "REMOTE_FILTER_UNKNOWN_COUNTRY",
        message: "No country matches that name.",
      });
      expect(row()).toEqual([{ country: "PL", filter_on: 1, look_country: null }]);
    },
  );

  it("setFilterOn: switches off and on (AC-07)", async () => {
    await post("country", { name: "Poland" });
    const off = await post("filter", { on: false });
    expect(off.statusCode).toBe(200);
    contract.expectContract("setFilterOn", 200, off.json());
    expect(off.json()).toMatchObject({ country: PL, filter_on: false });
  });

  it("setLook: starts and ends a look without touching the owner's country (AC-06)", async () => {
    await post("country", { name: "Poland" });
    const start = await post("look", { name: "Germany" });
    expect(start.statusCode).toBe(200);
    contract.expectContract("setLook", 200, start.json());
    expect(start.json()).toEqual({ look: DE });
    expect((await get()).json()).toMatchObject({ country: PL });
    const end = await post("look", { name: null });
    contract.expectContract("setLook", 200, end.json());
    expect(end.json()).toEqual({ look: null });
  });

  it("setLook refuses an unknown name (AC-05 during a look)", async () => {
    const res = await post("look", { name: "Polnd" });
    expect(res.statusCode).toBe(400);
    contract.expectContract("setLook", 400, res.json());
    expect(res.json().error.code).toBe("REMOTE_FILTER_UNKNOWN_COUNTRY");
  });

  it.each([
    ["country", { name: "" }],
    ["country", { name: "x".repeat(101) }],
    ["country", { name: "Poland", extra: 1 }],
    ["filter", { on: "yes" }],
    ["filter", {}],
    ["look", { name: "" }],
  ])("refuses a malformed %s body %j with 400 VALIDATION_ERROR", async (path, body) => {
    const res = await post(path, body);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-JSON body with 415", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/remote-filter/country",
      headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
      payload: "name=Poland",
    });
    expect(res.statusCode).toBe(415);
    contract.expectContract("chooseCountry", 415, res.json());
  });

  describe("nobody else can read or change the settings (AC-12)", () => {
    it.each([
      ["a foreign Host", { host: "evil.test" }, "FORBIDDEN_HOST"],
      ["a cross-site page", { "sec-fetch-site": "cross-site" }, "CROSS_SITE_REQUEST"],
    ])("refuses %s, leaving the row unchanged", async (_, extra, code) => {
      await post("country", { name: "Poland" });
      for (const [path, body, op] of [
        ["country", { name: "Germany" }, "chooseCountry"],
        ["filter", { on: false }, "setFilterOn"],
        ["look", { name: "Germany" }, "setLook"],
      ] as const) {
        const res = await post(path, body, extra);
        expect(res.statusCode).toBe(403);
        contract.expectContract(op, 403, res.json());
        expect(res.json().error.code).toBe(code);
      }
      expect(row()).toEqual([{ country: "PL", filter_on: 1, look_country: null }]);
    });

    it("refuses a foreign Host reading the settings", async () => {
      const res = await get({ host: "evil.test" });
      expect(res.statusCode).toBe(403);
      contract.expectContract("getRemoteFilterSettings", 403, res.json());
    });
  });
});
