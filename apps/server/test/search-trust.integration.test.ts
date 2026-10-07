import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { type FakeSources, json, startFakeSources, xml } from "./helpers/fake-sources.js";
import { addPosting, seedOpenPostings, setSearchState } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const host = { host: "127.0.0.1:3000" };

let t: TempDb;
let app: FastifyInstance | undefined;
let clock: number;

beforeEach(() => {
  t = createTempDb();
  clock = Date.UTC(2026, 9, 5, 9);
});
afterEach(async () => {
  await app?.close();
  app = undefined;
  t.cleanup();
});

async function start(extra: { sourcesBaseUrl?: string; now?: () => number } = {}) {
  app = await buildApp({
    port: 3000,
    collector: { databaseFile: t.file, scheduler: false, now: () => clock, ...extra },
  });
  await app.ready();
  return app;
}

const post = (url: string, payload: object = {}) =>
  (app as FastifyInstance).inject({ method: "POST", url, headers: host, payload });

describe("currency (spec §6, QG-1)", () => {
  let fake: FakeSources;
  beforeEach(async () => {
    fake = await startFakeSources();
    const jobicy = readFileSync(new URL("./fixtures/sources/jobicy/complete.json", import.meta.url), "utf8");
    fake.route("/api/v2/remote-jobs", json(jobicy));
    fake.route("/api/remote-jobs", json(JSON.stringify({ "job-count": 0, "total-job-count": 0, jobs: [] })));
    fake.route("/jobs/api", json(JSON.stringify({ jobs: [], nextCursor: null })));
    fake.route("/remote-jobs.rss", xml('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>'));
  });
  afterEach(async () => fake.close());

  it("lists every posting of a run that finished before the search started", async () => {
    await start({ sourcesBaseUrl: fake.baseUrl, now: Date.now });
    expect((await post("/api/v1/collector/runs")).statusCode).toBe(202);
    const finished = () =>
      t.db.all<{ n: number }>(sql`select count(*) as n from collector_runs where status != 'running'`)[0]
        ?.n === 1;
    for (const end = Date.now() + 10_000; !finished(); ) {
      if (Date.now() > end) throw new Error("run did not finish");
      await new Promise((r) => setTimeout(r, 20));
    }

    const collected = t.db
      .all<{ id: string }>(sql`select id from collector_postings where status = 'open'`)
      .map((r) => r.id);
    expect(collected.length).toBeGreaterThan(0);
    const feed = (await post("/api/v1/search/snapshots", { skills: "" })).json();
    expect(feed.items.map((p: { id: string }) => p.id).sort()).toEqual([...collected].sort());
    const engineers = (await post("/api/v1/search/snapshots", { skills: "Engineer" })).json();
    expect(engineers.total).toBeGreaterThan(0);
  });
});

describe("paging under a mutating collection run (AC-16, QG-3)", () => {
  it("shows 130 results without repeats or gaps, never inserts later postings, and counts them waiting", async () => {
    const reopenLater = addPosting(t.db, { title: "Go engineer", firstFoundAt: 10, status: "closed" });
    const seeded = seedOpenPostings(t.db, 130, (i) => ({ title: "Go engineer", firstFoundAt: 100 + i }));
    const oldest = seeded[0] as string; // last in the list, on page 3
    await start();

    const first = (await post("/api/v1/search/snapshots", { skills: "Go" })).json();
    expect(first).toMatchObject({ total: 130, next_cursor: "50" });
    const firstIds: string[] = first.items.map((p: { id: string }) => p.id);

    // A run after loading: adds two matching postings and one that does not match, merges a
    // posting's time earlier, reopens one closed before loading, and closes one on screen and one
    // not yet shown.
    clock += HOUR;
    addPosting(t.db, { title: "Go lead", firstFoundAt: clock });
    addPosting(t.db, { title: "Go architect", firstFoundAt: clock });
    addPosting(t.db, { title: "Designer", firstFoundAt: clock });
    const later: string[] = [];
    const onScreen = firstIds[10] as string;
    t.db.run(sql`update collector_postings set status = 'closed' where id = ${onScreen}`);
    t.db.run(sql`update collector_postings set status = 'open' where id = ${reopenLater}`);

    const second = (
      await post(`/api/v1/search/snapshots/${first.snapshot_id}/pages`, { cursor: "50" })
    ).json();
    const mergedEarlier = second.items[5].id as string;
    t.db.run(sql`update collector_postings set published_at = 1 where id = ${mergedEarlier}`);
    t.db.run(sql`update collector_postings set status = 'closed' where id = ${oldest}`); // not yet shown
    const third = (
      await post(`/api/v1/search/snapshots/${first.snapshot_id}/pages`, { cursor: second.next_cursor })
    ).json();
    expect(third.has_next).toBe(false);
    later.push(...third.items.map((p: { id: string }) => p.id));

    const shown = [...firstIds, ...second.items.map((p: { id: string }) => p.id), ...later];
    expect(new Set(shown).size).toBe(shown.length); // no repeats
    expect(shown).toContain(onScreen); // closed while on screen: stays until refreshed
    expect(shown).not.toContain(oldest); // closed before its page was read (sad §11)
    expect(shown).toHaveLength(129); // nothing else skipped
    expect(shown).not.toContain(reopenLater); // never inserted
    const descending = [...shown].sort().reverse();
    expect(shown).toEqual(descending); // the load-time order (ids follow first_found_at here)

    const waiting = (await post(`/api/v1/search/snapshots/${first.snapshot_id}/waiting`)).json();
    expect(waiting).toEqual({ waiting_count: 2 });
  });

  it("leaves a posting closed after loading out of a page not yet shown (sad §11)", async () => {
    seedOpenPostings(t.db, 60, () => ({ title: "Go engineer" }));
    await start();
    const first = (await post("/api/v1/search/snapshots", { skills: "Go" })).json();
    const before = (
      await post(`/api/v1/search/snapshots/${first.snapshot_id}/pages`, { cursor: "50" })
    ).json();
    const closing = before.items[3].id as string;
    t.db.run(sql`update collector_postings set status = 'closed' where id = ${closing}`);
    const after = (
      await post(`/api/v1/search/snapshots/${first.snapshot_id}/pages`, { cursor: "50" })
    ).json();
    expect(after.items.map((p: { id: string }) => p.id)).toEqual(
      before.items.map((p: { id: string }) => p.id).filter((id: string) => id !== closing),
    );
  });
});

describe("late arrivals (AC-14, QG-3)", () => {
  it("marks a posting published two days ago but first collected this morning new, in its publication-time position", async () => {
    const yesterday9 = clock - DAY;
    const twoDaysAgo = clock - 2 * DAY;
    const thisMorning = clock - 2 * HOUR;
    const old = addPosting(t.db, { title: "Go", publishedAt: twoDaysAgo - HOUR, firstFoundAt: twoDaysAgo });
    const fresh = addPosting(t.db, { title: "Go", publishedAt: thisMorning, firstFoundAt: thisMorning });
    const late = addPosting(t.db, { title: "Go", publishedAt: twoDaysAgo, firstFoundAt: thisMorning });
    const reopened = addPosting(t.db, {
      title: "Go",
      publishedAt: clock - 30 * HOUR,
      firstFoundAt: clock - 30 * HOUR,
    });
    setSearchState(t.db, { visitStartedAt: yesterday9, visitLastSeenAt: yesterday9 + HOUR });
    await start();

    const visit = (await post("/api/v1/search/visits")).json();
    expect(visit.previous_visit_started_at).toBe(new Date(yesterday9).toISOString());
    const result = (await post("/api/v1/search/snapshots", { skills: "Go" })).json();
    expect(result.items.map((p: { id: string; is_new: boolean }) => [p.id, p.is_new])).toEqual([
      [fresh, true],
      [reopened, false], // collected before the previous visit: not new
      [late, true], // at its publication time, below postings already read
      [old, false],
    ]);
    expect(result.new_count).toBe(2);

    // Searching again within the visit keeps the same previous visit.
    clock += 10 * 60_000;
    await post("/api/v1/search/visits");
    expect((await post("/api/v1/search/snapshots", { skills: "Go" })).json().new_count).toBe(2);
  });
});
