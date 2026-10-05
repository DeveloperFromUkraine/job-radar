import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

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

  beforeAll(async () => {
    t = createTempDb();
    // Every 8th posting mentions React in its title: 1,250 results, 25 pages.
    seedOpenPostings(t.db, 10_000, (i) => ({
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
});
