import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sourceById } from "../src/modules/collector/domain/sources.js";
import { createSourceHttp } from "../src/modules/collector/infra/http.js";
import { ensureSources, readTimesSince } from "../src/modules/collector/infra/repo/sources.js";
import { jobicyAdapter } from "../src/modules/collector/infra/sources/jobicy.js";
import { type FakeSources, fixture, json, startFakeSources } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 24 * 60 * 60 * 1000;

describe("ledgered source HTTP (sad §8 Outbound HTTP)", () => {
  let db: TempDb;
  let fake: FakeSources;

  beforeEach(async () => {
    db = createTempDb();
    ensureSources(db.db);
    fake = await startFakeSources();
  });

  afterEach(async () => {
    db.cleanup();
    await fake.close();
  });

  const http = (opts: { timeoutMs?: number; maxBytes?: number } = {}) =>
    createSourceHttp(db.db, sourceById("jobicy"), { now: () => NOW, ...opts });

  it("records the read in the ledger before the request is sent", async () => {
    let ledgerAtRequest = -1;
    fake.route("/x", (_req, res) => {
      ledgerAtRequest =
        db.db.all<{ n: number }>(sql`select count(*) as n from collector_request_ledger`)[0]?.n ?? -1;
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });

    const result = await http().getJson(`${fake.baseUrl}/x`);

    expect(result).toEqual({ kind: "ok", body: {} });
    expect(ledgerAtRequest).toBe(1);
    expect(readTimesSince(db.db, "jobicy", 0)).toEqual([NOW]);
  });

  it("sends nothing when the source's window is used up", async () => {
    fake.route("/x", json("{}"));
    await http().getJson(`${fake.baseUrl}/x`); // Jobicy: 1 per hour

    const second = await http().getJson(`${fake.baseUrl}/x`);

    expect(second).toEqual({ kind: "limited" });
    expect(fake.requests).toHaveLength(1);
  });

  it("records no read once shutdown has begun (round-2 review R6)", async () => {
    fake.route("/x", json("{}"));
    const stopping = new AbortController();
    stopping.abort();
    const http = createSourceHttp(db.db, sourceById("jobicy"), { now: () => NOW, signal: stopping.signal });

    await expect(http.getJson(`${fake.baseUrl}/x`)).rejects.toThrow(/stopping/);
    expect(readTimesSince(db.db, "jobicy", 0)).toEqual([]);
    expect(fake.requests).toEqual([]);
  });

  it("identifies itself with the personal-use User-Agent", async () => {
    let agent = "";
    fake.route("/x", (req, res) => {
      agent = req.headers["user-agent"] ?? "";
      res.writeHead(200).end("{}");
    });
    await http().getJson(`${fake.baseUrl}/x`);
    expect(agent).toBe("job-radar (personal use)");
  });

  it("fails a response over the size cap", async () => {
    fake.route("/big", (_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(`"${"x".repeat(2048)}"`);
    });
    expect(await http({ maxBytes: 1024 }).getJson(`${fake.baseUrl}/big`)).toMatchObject({
      kind: "failed",
      failure: { code: "too_large" },
    });
  });

  it("fails a source that does not answer in time", async () => {
    fake.route("/slow", async (_req, res) => {
      await new Promise((r) => setTimeout(r, 300));
      res.writeHead(200).end("{}");
    });
    expect(await http({ timeoutMs: 50 }).getJson(`${fake.baseUrl}/slow`)).toMatchObject({
      kind: "failed",
      failure: { code: "timed_out" },
    });
  });

  it.each([
    [429, "refused"],
    [403, "refused"],
    [500, "unreachable"],
  ] as const)("maps HTTP %i to %s", async (status, code) => {
    fake.route("/s", json("{}", status));
    expect(await http().getJson(`${fake.baseUrl}/s`)).toMatchObject({ kind: "failed", failure: { code } });
  });

  it("fails an unreadable body", async () => {
    fake.route("/bad", (_req, res) => {
      res.writeHead(200).end("<html>oops</html>");
    });
    expect(await http().getJson(`${fake.baseUrl}/bad`)).toMatchObject({
      kind: "failed",
      failure: { code: "unreadable" },
    });
  });

  it("fails an unreachable source", async () => {
    expect(await http().getJson("http://127.0.0.1:1/nothing")).toMatchObject({
      kind: "failed",
      failure: { code: "unreachable" },
    });
  });
});

describe("Jobicy adapter (ADR-0004)", () => {
  let db: TempDb;
  let fake: FakeSources;

  beforeEach(async () => {
    db = createTempDb();
    ensureSources(db.db);
    fake = await startFakeSources();
  });

  afterEach(async () => {
    db.cleanup();
    await fake.close();
  });

  const run = () =>
    jobicyAdapter(fake.baseUrl).fetchLatest({
      http: createSourceHttp(db.db, sourceById("jobicy"), { now: () => NOW }),
      now: NOW,
    });

  it("reads the newest listings in one request and normalizes their fields", async () => {
    fake.route("/api/v2/remote-jobs", json(fixture("jobicy/complete.json")));

    const result = await run();

    expect(fake.requests).toEqual(["/api/v2/remote-jobs?count=200"]);
    expect(result.completeness).toBe("complete");
    expect(result.itemsReturned).toBe(3);
    expect(result.coversPublishedAfter).toBe(NOW - 7 * DAY + 12 * 60 * 60 * 1000);
    expect(result.listings[0]).toEqual({
      sourceItemId: "900003",
      url: "https://jobs.example.test/jobicy/900003",
      title: "Senior Backend Engineer",
      company: "Example Co",
      description: "<p>Build &amp; ship <b>APIs</b>.</p>",
      locationRestriction: "Europe",
      categories: ["Software Engineering"],
      publishedAt: Date.parse("2026-10-02T10:00:00+00:00"),
      expiresAt: null,
    });
  });

  it("treats jobGeo Anywhere as nothing stated, never as anywhere (AC-22)", async () => {
    fake.route("/api/v2/remote-jobs", json(fixture("jobicy/complete.json")));
    const result = await run();
    expect(result.listings[1]?.locationRestriction).toBeNull();
  });

  it("is capped when more jobs were available than one page", async () => {
    fake.route("/api/v2/remote-jobs", json(fixture("jobicy/capped.json")));
    expect((await run()).completeness).toBe("capped");
  });

  it("fails an unexpected response shape with nothing to close on (AC-03)", async () => {
    fake.route("/api/v2/remote-jobs", json(fixture("jobicy/malformed.json")));
    const result = await run();
    expect(result).toMatchObject({ completeness: "failed", listings: [], failure: { code: "unreadable" } });
  });

  it("is partial, not failed, when the window is already used up", async () => {
    fake.route("/api/v2/remote-jobs", json(fixture("jobicy/complete.json")));
    await run();
    const second = await run();
    expect(second).toMatchObject({ completeness: "partial", listings: [] });
  });
});
