import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { seedProfile, seedScores } from "./helpers/matching-fixtures.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

// spec §6 NFRs: ≤ 1 s p95 for a search and for show more, 10,000 open postings, up to 20 skills.
// SKIP_PERF=1 skips it on a machine too slow to measure; the thresholds are never loosened.
const SKILLS =
  "React, TypeScript, Go, Rust, Python, Java, Kotlin, Swift, C#, C++, .NET, Node.js, AWS, Docker, " +
  "Kubernetes, PostgreSQL, GraphQL, Terraform, machine learning, Ruby";
// ~5 KB of text that mentions none of the skills, so every pattern scans all of it (the worst case).
const DESCRIPTION =
  "We are a remote-first team building tools for small businesses across many markets. ".repeat(60);

const p95 = (ms: number[]) => [...ms].sort((a, b) => a - b)[Math.ceil(ms.length * 0.95) - 1] as number;

describe.skipIf(process.env.SKIP_PERF)("search latency at 10,000 open postings", () => {
  let t: TempDb;
  let app: FastifyInstance;
  let ids: string[];

  beforeAll(async () => {
    t = createTempDb();
    // Every 8th posting mentions React in its title: 1,250 results, 25 pages.
    ids = seedOpenPostings(t.db, 10_000, (i) => ({
      title: i % 8 === 0 ? "Senior React Engineer" : "Account Manager",
      description: DESCRIPTION,
    }));
    app = await buildApp({ port: 3000, collector: { databaseFile: t.file, scheduler: false } });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    t?.cleanup();
  });

  const post = (url: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { host: "127.0.0.1:3000" }, payload });

  it("answers a 20-skill search in ≤ 1 s p95 over 50 searches, and each next page in ≤ 1 s p95", async () => {
    const searches: number[] = [];
    const pages: number[] = [];
    for (let i = 0; i < 50; i++) {
      let started = performance.now();
      const res = await post("/api/v1/search/snapshots", { skills: SKILLS });
      searches.push(performance.now() - started);
      const body = res.json();
      expect(body).toMatchObject({ total: 1_250, has_next: true });

      started = performance.now();
      const page = await post(`/api/v1/search/snapshots/${body.snapshot_id}/pages`, {
        cursor: String(50 * (1 + (i % 24))),
      });
      pages.push(performance.now() - started);
      expect(page.json().items).toHaveLength(50);
    }
    expect(p95(searches)).toBeLessThanOrEqual(1_000);
    expect(p95(pages)).toBeLessThanOrEqual(1_000);
  }, 120_000);

  // remote-filter spec §6: the same target with the filter on for Poland. ~50 distinct statements (the
  // 2026-10-14 collection's size), then the worst case where every statement is distinct.
  it("holds ≤ 1 s p95 with the location filter on for Poland (remote-filter §6)", async () => {
    const STATEMENTS = [
      "USA",
      "EMEA",
      "LATAM",
      "Europe",
      "Poland",
      "UK",
      "Canada, USA",
      "APAC",
      "Worldwide",
      "Spain",
      "🇵🇱 Poland, 🇺🇦 Ukraine",
      "UTC-1 to UTC+3",
      "Helsinki",
      "Worldwide except Poland",
      "Anywhere",
      "United States, UTC-10 to UTC+14",
      "Germany",
      "Brazil, Canada, USA",
      "Europe, USA",
      "Mexico",
    ];
    const measure = async () => {
      const searches: number[] = [];
      for (let i = 0; i < 50; i++) {
        const started = performance.now();
        const body = (await post("/api/v1/search/snapshots", { skills: SKILLS })).json();
        searches.push(performance.now() - started);
        expect(body.location_filter.mode).toBe("own");
        expect(body.total + body.hidden_count).toBe(1_250);
        expect(body.hidden_count).toBeGreaterThan(0);
      }
      return p95(searches);
    };
    expect((await post("/api/v1/remote-filter/country", { name: "Poland" })).statusCode).toBe(200);
    try {
      t.db.run(sql`update collector_listings set location_restriction = case abs(random()) % 50
        ${sql.raw(STATEMENTS.map((s, i) => `when ${i} then '${s}'`).join(" "))} else 'USA, Region ' || (rowid % 30) end`);
      const typical = await measure();
      // Every statement distinct yet readable: three of 40 countries that leave Poland out, by rowid.
      const C =
        "USA Canada Mexico Brazil Chile Peru Japan India Kenya Egypt Spain France Italy Ireland Norway Sweden Finland Denmark Portugal Greece Austria Belgium Croatia Estonia Latvia Malta Cyprus Iceland Turkey Israel Jordan Ghana Nigeria Morocco Tunisia Vietnam Thailand Singapore Australia Argentina".split(
          " ",
        );
      const rows = t.db.all<{ id: string; rowid: number }>(sql`select id, rowid from collector_listings`);
      t.db.transaction((tx) => {
        for (const { id, rowid } of rows) {
          const pick = [rowid % 40, Math.floor(rowid / 40) % 40, Math.floor(rowid / 1600) % 40].map(
            (i) => C[i],
          );
          tx.run(
            sql`update collector_listings set location_restriction = ${`${pick.join(", ")}, ${rowid % 2 ? "UTC-8" : "PST"}`} where id = ${id}`,
          );
        }
      });
      const allDistinct = await measure();
      console.info(
        `remote-filter search p95: ${Math.round(typical)} ms typical, ${Math.round(allDistinct)} ms all distinct`,
      );
      expect(typical).toBeLessThanOrEqual(1_000);
      expect(allDistinct).toBeLessThanOrEqual(1_000);
    } finally {
      // The next test measures marks alone: back to every posting open to everyone, filter off.
      t.db.run(sql`update collector_listings set location_restriction = 'Worldwide'`);
      await post("/api/v1/remote-filter/filter", { on: false });
    }
  }, 180_000);

  // applied-skipped spec §6: the same targets with 5,000 marked postings. Every other React posting
  // is marked (625), so each page walks past marked ids; the other 4,375 marks are non-matching.
  it("holds the same targets with 5,000 marked postings (applied-skipped §6)", async () => {
    const react = ids.filter((_, i) => i % 8 === 0);
    const others = ids.filter((_, i) => i % 8 !== 0);
    seedMarks(t.db, [...react.filter((_, i) => i % 2 === 0), ...others.slice(0, 4_375)], { mark: "skipped" });

    const searches: number[] = [];
    const pages: number[] = [];
    for (let i = 0; i < 50; i++) {
      let started = performance.now();
      const res = await post("/api/v1/search/snapshots", { skills: SKILLS });
      searches.push(performance.now() - started);
      const body = res.json();
      expect(body).toMatchObject({ total: 625, marked_count: 625, has_next: true });
      started = performance.now();
      const page = await post(`/api/v1/search/snapshots/${body.snapshot_id}/pages`, {
        cursor: String(50 * (1 + (i % 12))),
      });
      pages.push(performance.now() - started);
      expect(page.json().items).toHaveLength(50);
    }
    expect(p95(searches)).toBeLessThanOrEqual(1_000);
    expect(p95(pages)).toBeLessThanOrEqual(1_000);
  }, 180_000);
});

// applied-skipped spec §6 Marked view: ≤ 1 s p95 to show the first 50 marked postings, with 5,000
// marked postings and up to 20 skills; p95 over 50 loads. A third of them closed.
describe.skipIf(process.env.SKIP_PERF)("marked view latency at 5,000 marked postings", () => {
  let t: TempDb;
  let app: FastifyInstance;

  beforeAll(async () => {
    t = createTempDb();
    seedOpenPostings(t.db, 10_000, () => ({ title: "Account Manager", description: DESCRIPTION }));
    const marked = seedOpenPostings(t.db, 5_000, (i) => ({
      title: i % 8 === 0 ? "Senior React Engineer" : "Account Manager",
      description: DESCRIPTION,
    }));
    seedMarks(t.db, marked, { mark: "skipped" });
    t.db.run(sql`update collector_postings set status = 'closed'
      where id in (select posting_id from tracking_marks where rowid % 3 = 0)`);
    app = await buildApp({ port: 3000, collector: { databaseFile: t.file, scheduler: false } });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    t?.cleanup();
  });

  it("shows the first 50 marked postings in ≤ 1 s p95 over 50 loads, with 20 skills", async () => {
    const loads: number[] = [];
    for (let i = 0; i < 50; i++) {
      const started = performance.now();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/search/marked-snapshots",
        headers: { host: "127.0.0.1:3000" },
        payload: { skills: SKILLS },
      });
      loads.push(performance.now() - started);
      expect(res.json()).toMatchObject({ marked_count: 625 });
      expect(res.json().items).toHaveLength(50);
    }
    expect(p95(loads)).toBeLessThanOrEqual(1_000);
  }, 180_000);
});

// match-score spec §6 "Search response with scores": ≤ 1 s p95 to the first 50 postings, with 10,000
// open postings, scores and a profile — unchanged from search, in either order. Best match first reads
// and fingerprints every shown posting, so the feed (all 10,000 shown) is the worst case.
describe.skipIf(process.env.SKIP_PERF)("search latency with scores and a profile (match-score §6)", () => {
  let t: TempDb;
  let app: FastifyInstance;

  beforeAll(async () => {
    t = createTempDb();
    const ids = seedOpenPostings(t.db, 10_000, (i) => ({
      title: i % 8 === 0 ? "Senior React Engineer" : "Account Manager",
      description: DESCRIPTION,
    }));
    seedProfile(t.db);
    // Mixed states: most scored (some stale), some never scored.
    seedScores(
      t.db,
      ids.filter((_, i) => i % 10 !== 0),
      (i) => ({ total: (i * 37) % 101 }),
    );
    app = await buildApp({ port: 3000, collector: { databaseFile: t.file, scheduler: false } });
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    t?.cleanup();
  });

  const post = (url: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { host: "127.0.0.1:3000" }, payload });

  it.each([
    ["a 20-skill search", SKILLS, 1_250],
    ["the feed (all 10,000 shown)", "", 10_000],
  ])(
    "answers %s best match first and newest first in ≤ 1 s p95, pages too",
    async (_n, skills, total) => {
      for (const order of ["best_match", "newest"] as const) {
        const searches: number[] = [];
        const pages: number[] = [];
        for (let i = 0; i < 20; i++) {
          let started = performance.now();
          const res = await post("/api/v1/search/snapshots", { skills, order });
          searches.push(performance.now() - started);
          const body = res.json();
          expect(body).toMatchObject({ total, has_profile: true, order });
          started = performance.now();
          const page = await post(`/api/v1/search/snapshots/${body.snapshot_id}/pages`, { cursor: "50" });
          pages.push(performance.now() - started);
          expect(page.json().items).toHaveLength(50);
        }
        expect(p95(searches), `${order} search`).toBeLessThanOrEqual(1_000);
        expect(p95(pages), `${order} page`).toBeLessThanOrEqual(1_000);
      }
    },
    240_000,
  );
});
