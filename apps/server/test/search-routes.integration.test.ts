import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { loadContract } from "./helpers/contract.js";
import { addPosting, seedOpenPostings } from "./helpers/search-fixtures.js";

const contract = loadContract("search-postings");
const headers = { host: "127.0.0.1:3000" };

let dir: string;
let databaseFile: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-search-"));
  databaseFile = join(dir, "job-radar.sqlite");
  const handle = openDb(databaseFile);
  runMigrations(handle.db);
  addPosting(handle.db, {
    title: "Senior React Engineer",
    description: "TypeScript daily",
    publishedAt: Date.UTC(2026, 9, 3, 8),
    firstFoundAt: Date.UTC(2026, 9, 5, 7, 10),
    listings: [{}, { sourceId: "himalayas", status: "closed", locationRestriction: null }],
  });
  seedOpenPostings(handle.db, 60, () => ({ title: "Go engineer" }));
  handle.close();
  app = await buildApp({ port: 3000, collector: { databaseFile, scheduler: false } });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (url: string, payload: unknown = {}, extra: Record<string, string> = {}) =>
  app.inject({ method: "POST", url, headers: { ...headers, ...extra }, payload: payload as object });

async function search(skills: string) {
  const res = await post("/api/v1/search/snapshots", { skills });
  return res.json();
}

describe("search routes", () => {
  it("openVisit: remembers the last skills and returns a contract Visit", async () => {
    const first = await post("/api/v1/search/visits");
    expect(first.statusCode).toBe(200);
    contract.expectContract("openVisit", 200, first.json());
    expect(first.json()).toEqual({ last_skills: [], previous_visit_started_at: null });

    await search("React, Go");
    const again = await post("/api/v1/search/visits");
    contract.expectContract("openVisit", 200, again.json());
    expect(again.json().last_skills).toEqual(["React", "Go"]);
  });

  it("runSearch: returns the contract SearchResult", async () => {
    const res = await post("/api/v1/search/snapshots", { skills: "React, TypeScript" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    contract.expectContract("runSearch", 200, body);
    expect(body).toMatchObject({ total: 1, skills: ["React", "TypeScript"], has_next: false });
    expect(body.items[0].listings[1]).toEqual({
      source_id: "himalayas",
      status: "closed",
      url: null,
      location_restriction: null,
    });

    const feed = await search("");
    contract.expectContract("runSearch", 200, feed);
    expect(feed).toMatchObject({ total: 61, next_cursor: "50" });
  });

  it("runSearch: 400 names the skill and the rule (AC-05); 400 VALIDATION_ERROR for a bad body", async () => {
    const res = await post("/api/v1/search/snapshots", { skills: "React, --" });
    expect(res.statusCode).toBe(400);
    contract.expectContract("runSearch", 400, res.json());
    expect(res.json().error).toEqual({
      code: "SEARCH_INVALID_SKILLS",
      message: '"--" needs at least one letter or digit.',
    });

    const shape = await post("/api/v1/search/snapshots", {});
    expect(shape.statusCode).toBe(400);
    expect(shape.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("getNextPage: the next page, then 410 for an unknown snapshot, 400 for a non-UUID id", async () => {
    const first = await search("");
    const page = await post(`/api/v1/search/snapshots/${first.snapshot_id}/pages`, { cursor: "50" });
    expect(page.statusCode).toBe(200);
    contract.expectContract("getNextPage", 200, page.json());
    expect(page.json()).toMatchObject({ has_next: false, next_cursor: null });
    expect(page.json().items).toHaveLength(11);

    const gone = await post("/api/v1/search/snapshots/01926a3b-1c2d-7e4f-8a00-0000000000a1/pages", {
      cursor: "50",
    });
    expect(gone.statusCode).toBe(410);
    contract.expectContract("getNextPage", 410, gone.json());
    expect(gone.json().error.code).toBe("SEARCH_SNAPSHOT_EXPIRED");

    const bad = await post("/api/v1/search/snapshots/not-a-uuid/pages", { cursor: "50" });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
    const cursor = await post(`/api/v1/search/snapshots/${first.snapshot_id}/pages`, { cursor: "-1" });
    expect(cursor.statusCode).toBe(400);
  });

  it("getWaitingCount: the waiting count, 410 for an unknown snapshot", async () => {
    const first = await search("Go");
    const res = await post(`/api/v1/search/snapshots/${first.snapshot_id}/waiting`);
    expect(res.statusCode).toBe(200);
    contract.expectContract("getWaitingCount", 200, res.json());
    expect(res.json()).toEqual({ waiting_count: 0 });

    const gone = await post("/api/v1/search/snapshots/01926a3b-1c2d-7e4f-8a00-0000000000a1/waiting");
    expect(gone.statusCode).toBe(410);
  });

  it("keeps the app on this machine only (AC-17): foreign Host, cross-site, no JSON body", async () => {
    const foreign = await app.inject({
      method: "POST",
      url: "/api/v1/search/snapshots",
      headers: { host: "evil.example:3000" },
      payload: { skills: "" },
    });
    expect([foreign.statusCode, foreign.json().error.code]).toEqual([403, "FORBIDDEN_HOST"]);
    contract.expectContract("runSearch", 403, foreign.json());

    const crossSite = await post(
      "/api/v1/search/snapshots",
      { skills: "" },
      { "sec-fetch-site": "cross-site" },
    );
    expect([crossSite.statusCode, crossSite.json().error.code]).toEqual([403, "CROSS_SITE_REQUEST"]);

    const noJson = await app.inject({ method: "POST", url: "/api/v1/search/visits", headers });
    expect([noJson.statusCode, noJson.json().error.code]).toEqual([415, "UNSUPPORTED_MEDIA_TYPE"]);
    contract.expectContract("openVisit", 415, noJson.json());
  });
});
