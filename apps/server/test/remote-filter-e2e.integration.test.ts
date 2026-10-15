import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { ingestSource } from "../src/modules/collector/app/ingest.js";
import { openRun } from "../src/modules/collector/app/open-run.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import type { SourceId } from "../src/modules/collector/domain/sources.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { loadContract } from "./helpers/contract.js";
import { type FakeSources, json, startFakeSources, xml } from "./helpers/fake-sources.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// AC-10 and AC-11 end to end: real source readers, merge and routes; only the boards are fake.
// runSearch as restated by match-score (it supersedes remote-filter's).
const contract = loadContract("match-score");
const T0 = Date.UTC(2026, 9, 14, 8);
const headers = { host: "127.0.0.1:3000" };

const jobicyJob = (id: number, jobTitle: string, companyName: string, jobGeo: string) => ({
  id,
  url: `https://jobs.example.test/jobicy/${id}`,
  jobTitle,
  companyName,
  jobIndustry: ["Software Engineering"],
  jobGeo,
  jobDescription: "<p>Build things.</p>",
  pubDate: "2026-10-14T06:00:00+00:00",
});
const wwrItem = (id: number, heading: string, region: string, country = "") =>
  `<item><title>${heading}</title><region>${region}</region><country>${country}</country>
    <category>Back-End Programming</category><description>Role</description>
    <pubDate>${new Date(T0 - 3_600_000).toUTCString()}</pubDate>
    <expires_at>${new Date(T0 + 30 * 86_400_000).toUTCString()}</expires_at>
    <guid>https://jobs.example.test/wwr/${id}</guid><link>https://jobs.example.test/wwr/${id}</link></item>`;

describe("remote-filter end to end", () => {
  let t: TempDb;
  let dir: string;
  let fake: FakeSources;
  let app: FastifyInstance;

  beforeEach(async () => {
    t = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-rf-e2e-"));
    fake = await startFakeSources();
  });

  afterEach(async () => {
    await app?.close();
    await fake.close();
    t.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  async function collect() {
    const deps: CollectorDeps = {
      db: t.db,
      now: () => T0,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: fake.baseUrl }),
      timeZone: "Europe/Warsaw",
    };
    startUp(deps);
    const run = openRun(deps, "schedule");
    if (run.kind !== "started") throw new Error(`no run: ${run.kind}`);
    for (const source of ["jobicy", "weworkremotely"] as SourceId[]) await ingestSource(deps, run, source);
    t.db.run(sql`update collector_runs set status = 'finished' where status = 'running'`);
  }

  const post = (url: string, payload: object) => app.inject({ method: "POST", url, headers, payload });
  const titleOf = (body: { items: { title: string }[] }) => body.items.map((p) => p.title).sort();

  it("an explicit Anywhere fits Poland, as stated; beside USA it is set aside; marks stay visible (AC-10, AC-11)", async () => {
    fake.route(
      "/api/v2/remote-jobs",
      json(
        JSON.stringify({
          jobs: [
            jobicyJob(1, "Backend Engineer", "Example Co", "Anywhere"),
            jobicyJob(2, "Data Engineer", "Acme", "USA"),
            jobicyJob(3, "Go Engineer", "Globex", "USA"),
          ],
          hasMore: false,
          success: true,
        }),
      ),
    );
    fake.route(
      "/remote-jobs.rss",
      xml(
        `<?xml version="1.0"?><rss version="2.0"><channel>${[
          wwrItem(1, "Initech: Platform Engineer", "Anywhere in the World"),
          wwrItem(2, "Acme: Data Engineer", "Anywhere in the World"),
        ].join("")}</channel></rss>`,
      ),
    );
    await collect();
    // "Anywhere" never kept the Acme role's two listings apart (collector AC-05).
    expect(t.db.all(sql`select count(*) n from collector_postings`)).toEqual([{ n: 4 }]);

    app = await buildApp({
      port: 3000,
      collector: { databaseFile: t.file, scheduler: false, now: () => T0 },
    });
    await app.ready();
    const globex = (await post("/api/v1/search/snapshots", { skills: "" }))
      .json()
      .items.find((p: { company: string }) => p.company === "Globex").id;
    expect((await post(`/api/v1/tracking/marks/${globex}`, { mark: "applied" })).statusCode).toBe(200);

    expect((await post("/api/v1/remote-filter/country", { name: "Poland" })).statusCode).toBe(200);
    const list = (await post("/api/v1/search/snapshots", { skills: "" })).json();
    contract.expectContract("runSearch", 200, list);
    expect(titleOf(list)).toEqual(["Backend Engineer", "Platform Engineer"]);
    expect(list).toMatchObject({ total: 2, hidden_count: 1, marked_count: 1 });
    for (const p of list.items) {
      expect(p.location_check).toBeNull();
      expect(p.listings.map((l: { location_restriction: string }) => l.location_restriction)).toEqual([
        p.title === "Backend Engineer" ? "Anywhere" : "Anywhere in the World",
      ]);
    }

    const marked = (await post("/api/v1/search/marked-snapshots", { skills: "" })).json();
    contract.expectContract("runMarkedView", 200, marked); // as restated by match-score
    expect(titleOf(marked)).toEqual(["Go Engineer"]);
  });
});
