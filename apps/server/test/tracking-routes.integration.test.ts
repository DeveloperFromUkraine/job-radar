import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { newId } from "../src/core/id.js";
import { loadContract } from "./helpers/contract.js";
import { addPosting } from "./helpers/search-fixtures.js";

const contract = loadContract("applied-skipped");
const headers = { host: "127.0.0.1:3000" };

let dir: string;
let databaseFile: string;
let app: FastifyInstance;
let posting: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-tracking-"));
  databaseFile = join(dir, "job-radar.sqlite");
  const handle = openDb(databaseFile);
  runMigrations(handle.db);
  posting = addPosting(handle.db, { title: "Senior Backend Engineer", company: "ACME" });
  handle.close();
  app = await buildApp({ port: 3000, collector: { databaseFile, scheduler: false } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (url: string, payload: unknown, extra: Record<string, string> = {}) =>
  app.inject({ method: "POST", url, headers: { ...headers, ...extra }, payload: payload as object });
const mark = (id: string, body: unknown, extra?: Record<string, string>) =>
  post(`/api/v1/tracking/marks/${id}`, body, extra);
const undo = (id: string, body: unknown) => post(`/api/v1/tracking/marks/${id}/undo`, body);

function rows() {
  const db = new Database(databaseFile, { readonly: true });
  try {
    return db.prepare("select posting_id, mark from tracking_marks").all();
  } finally {
    db.close();
  }
}

describe("tracking routes", () => {
  it("setMark: marks, changes and clears, answering a contract MarkState (AC-01, AC-06)", async () => {
    for (const value of ["applied", "skipped", null]) {
      const res = await mark(posting, { mark: value });
      expect(res.statusCode).toBe(200);
      contract.expectContract("setMark", 200, res.json());
      expect(res.json().mark).toBe(value);
    }
  });

  it("undoMark: restores the earlier state, then refuses a stale change id (AC-03, AC-04)", async () => {
    const { change_id } = (await mark(posting, { mark: "applied" })).json();
    const undone = await undo(posting, { change_id });
    expect(undone.statusCode).toBe(200);
    contract.expectContract("undoMark", 200, undone.json());
    expect(undone.json()).toMatchObject({ mark: null, change_id: null });

    const again = await undo(posting, { change_id });
    expect(again.statusCode).toBe(409);
    contract.expectContract("undoMark", 409, again.json());
    expect(again.json().error.code).toBe("TRACKING_MARK_CHANGED_ELSEWHERE");
  });

  it("answers 404 for a posting that is not in job-radar (AC-15)", async () => {
    const res = await mark(newId(), { mark: "applied" });
    expect(res.statusCode).toBe(404);
    contract.expectContract("setMark", 404, res.json());
    expect(res.json().error.code).toBe("TRACKING_POSTING_NOT_FOUND");
  });

  it("answers 503 and records nothing when the database cannot take the write (AC-14)", async () => {
    const locker = new Database(databaseFile);
    locker.exec("begin immediate");
    try {
      const res = await mark(posting, { mark: "applied" });
      expect(res.statusCode).toBe(503);
      contract.expectContract("setMark", 503, res.json());
      expect(res.json().error.code).toBe("TRACKING_MARKS_UNAVAILABLE");
    } finally {
      locker.exec("rollback");
      locker.close();
    }
    expect(rows()).toEqual([]);
  }, 15_000);

  it.each([
    ["an unknown mark", { mark: "maybe" }],
    ["a missing mark", {}],
    ["an extra field", { mark: "applied", confirm: true }],
  ])("rejects %s with 400", async (_, body) => {
    const res = await mark(posting, body);
    expect(res.statusCode).toBe(400);
    contract.expectContract("setMark", 400, res.json());
  });

  it("rejects a posting id that is not a UUID, and an undo without a change id, with 400", async () => {
    expect((await mark("not-a-uuid", { mark: "applied" })).statusCode).toBe(400);
    expect((await undo(posting, {})).statusCode).toBe(400);
  });

  it("rejects a non-JSON body with 415", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/tracking/marks/${posting}`,
      headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
      payload: "mark=applied",
    });
    expect(res.statusCode).toBe(415);
    contract.expectContract("setMark", 415, res.json());
  });

  describe("only the owner's own screen changes marks (AC-16)", () => {
    it.each([
      ["a foreign Host", { host: "evil.test" }, "FORBIDDEN_HOST"],
      ["a cross-site page", { "sec-fetch-site": "cross-site" }, "CROSS_SITE_REQUEST"],
    ])("refuses %s, recording nothing", async (_, extra, code) => {
      const res = await mark(posting, { mark: "skipped" }, extra);
      expect(res.statusCode).toBe(403);
      contract.expectContract("setMark", 403, res.json());
      expect(res.json().error.code).toBe(code);
      expect(rows()).toEqual([]);
    });
  });
});
