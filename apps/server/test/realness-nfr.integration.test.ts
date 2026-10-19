import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { seedProfile, seedScores } from "./helpers/matching-fixtures.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// realness-score spec §6 "Search response with realness": ≤ 1 s p95 to the first 50 postings, 10,000 open
// postings, scores and realness on, in either order, 50 searches and 50 next pages each (spec Test plan) —
// unchanged from search (sad §10 QG-3).
// The worst case for the salary check: every listing's pay field is "" (stated nothing), so realness reads
// every title and description, and the text is full of numbers and non-pay amounts it must reject.
// SKIP_PERF=1 skips it on a machine too slow to measure; the thresholds are never loosened.
const DESCRIPTION =
  "We raised a $5M Series A in 2024 and serve 10,000 customers. You have 5+ years with Go and 3 years of SQL. " +
  "We offer a $2,000 learning budget, 25 days off and a 401(k) match. ".repeat(30);
const DAY = 24 * 60 * 60 * 1000;
const p95 = (ms: number[]) => [...ms].sort((a, b) => a - b)[Math.ceil(ms.length * 0.95) - 1] as number;

describe.skipIf(process.env.SKIP_PERF)("search latency with realness on (realness-score §6)", () => {
  let t: TempDb;
  let app: FastifyInstance;

  beforeAll(async () => {
    t = createTempDb();
    const now = Date.now();
    const ids = seedOpenPostings(t.db, 10_000, (i) => ({
      title: i % 8 === 0 ? "Senior React Engineer" : "Account Manager",
      // A few large look-alike groups, and ages across the thresholds.
      company: `Company ${i % 50}`,
      firstFoundAt: now - (i % 90) * DAY,
      reopenedAt: i % 13 === 0 ? now - DAY : null,
      description: DESCRIPTION,
      listings: [{ payField: "" }],
    }));
    // ~10% more as closed look-alikes found earlier, so the closed-heads read and the look-alike repost
    // rule run under load too (review F-07).
    seedOpenPostings(t.db, 1_000, (i) => ({
      title: i % 8 === 0 ? "Senior React Engineer" : "Account Manager",
      company: `Company ${i % 50}`,
      firstFoundAt: now - (100 + (i % 30)) * DAY,
      status: "closed",
      description: DESCRIPTION,
      listings: [{ payField: "", status: "closed" }],
    }));
    seedProfile(t.db);
    seedScores(
      t.db,
      ids.filter((_, i) => i % 10 !== 0),
      (i) => ({ total: (i * 37) % 101 }),
    );
    app = await buildApp({
      port: 3000,
      collector: { databaseFile: t.file, scheduler: false },
      search: { maxAgeDays: null }, // fixed early test times: the 10,000 must all be listed
    });
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    t?.cleanup();
  });

  const post = (url: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { host: "127.0.0.1:3000" }, payload });

  it("answers the feed (all 10,000 shown) in either order in ≤ 1 s p95, pages too, with reasons shown", async () => {
    for (const order of ["best_match", "newest"] as const) {
      const searches: number[] = [];
      const pages: number[] = [];
      for (let i = 0; i < 50; i++) {
        let started = performance.now();
        const res = await post("/api/v1/search/snapshots", { skills: "", order });
        searches.push(performance.now() - started);
        const body = res.json();
        expect(body).toMatchObject({ total: 10_000, order, realness_on: true });
        expect(body.items.some((p: { realness: unknown }) => p.realness !== null)).toBe(true);
        if (i === 0 && order === "newest")
          // best match first lowers the reposts out of the first 50
          expect(
            body.items.some((p: { realness: { signals: { kind: string }[] } | null }) =>
              p.realness?.signals.some((s) => s.kind === "repost"),
            ),
          ).toBe(true);
        started = performance.now();
        const page = await post(`/api/v1/search/snapshots/${body.snapshot_id}/pages`, { cursor: "50" });
        pages.push(performance.now() - started);
        expect(page.json().items).toHaveLength(50);
      }
      expect(p95(searches), `${order} search`).toBeLessThanOrEqual(1000);
      expect(p95(pages), `${order} page`).toBeLessThanOrEqual(1000);
    }
  }, 180_000);
});
