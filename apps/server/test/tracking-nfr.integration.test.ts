import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// applied-skipped spec §6 Mark response: ≤ 300 ms p95 from pressing applied / skipped to the posting
// leaving the list — the server's share is the mark call. 100 marks against 10,000 open postings.
// SKIP_PERF=1 skips it on a machine too slow to measure; the threshold is never loosened.
const p95 = (ms: number[]) => [...ms].sort((a, b) => a - b)[Math.ceil(ms.length * 0.95) - 1] as number;

describe.skipIf(process.env.SKIP_PERF)("mark response at 10,000 open postings", () => {
  let t: TempDb;
  let app: FastifyInstance;
  let ids: string[];

  beforeAll(async () => {
    t = createTempDb();
    ids = seedOpenPostings(t.db, 10_000, (i) => ({ title: `Engineer ${i}` }));
    app = await buildApp({ port: 3000, collector: { databaseFile: t.file, scheduler: false } });
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    t?.cleanup();
  });

  it("answers 100 marks in ≤ 300 ms p95", async () => {
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const started = performance.now();
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tracking/marks/${ids[i * 97]}`,
        headers: { host: "127.0.0.1:3000" },
        payload: { mark: i % 2 ? "applied" : "skipped" },
      });
      times.push(performance.now() - started);
      expect(res.statusCode).toBe(200);
    }
    console.info(`mark response p95: ${Math.round(p95(times))} ms`);
    expect(p95(times)).toBeLessThanOrEqual(300);
  }, 120_000);
});
