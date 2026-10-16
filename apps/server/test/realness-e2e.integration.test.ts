import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { setOn } from "../src/modules/realness/app/settings.js";
import type { MatchView, SearchDeps } from "../src/modules/search/app/deps.js";
import { nextPage } from "../src/modules/search/app/pages.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { fakeProvider } from "./helpers/fake-provider.js";
import { seedProfile } from "./helpers/matching-fixtures.js";
import { setRemoteFilterSettings } from "./helpers/remote-filter-fixtures.js";
import { fakeScoreReader, notScored, scored } from "./helpers/score-reader.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// realness-score sad §10 QG-1 (spec AC-03, AC-04, §6 No hiding / Newest-first unchanged) and QG-3 Cost
// (AC-13): a seeded loop over generated postings with signals, realness on vs off.
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 16, 10);

/** mulberry32: a small seeded PRNG, so a failing case can be replayed from its seed. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SOURCES = ["jobicy", "remotive", "himalayas", "weworkremotely"];
const PAY = [null, "", "USD 60000–80000", "competitive"];
const WHERE = ["Worldwide", "USA only", "Europe", null];
const TEXT = ["Build things.", "Salary range $120k–$150k.", "We raised a $5M Series A."];

function seed(t: TempDb, random: () => number, n: number) {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)] as T;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const firstFoundAt = NOW - Math.floor(random() * 120) * DAY - Math.floor(random() * DAY);
    const boards = SOURCES.filter(() => random() < 0.5);
    ids.push(
      addPosting(t.db, {
        title: pick(["Go Engineer", "Data Engineer", "Senior Go Engineer"]),
        company: pick(["Acme", "Beta", "Gamma"]),
        description: pick(TEXT),
        firstFoundAt,
        publishedAt: random() < 0.5 ? null : firstFoundAt - Math.floor(random() * 30) * DAY,
        reopenedAt: random() < 0.1 ? NOW - DAY : null,
        status: random() < 0.15 ? "closed" : "open",
        listings: (boards.length ? boards : ["jobicy"]).map((sourceId) => ({
          sourceId,
          payField: pick(PAY),
          locationRestriction: pick(WHERE),
        })),
      }),
    );
  }
  return ids;
}

type Result = ReturnType<typeof runSearch>;
function allPages(deps: SearchDeps, snapshots: ReturnType<typeof createSnapshotStore>, first: Result) {
  const items = [...first.items];
  let cursor = first.next_cursor;
  while (cursor) {
    const page = nextPage(deps, snapshots, first.snapshot_id, cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
  }
  return items;
}

describe("realness never costs the owner a posting (QG-1)", () => {
  let t: TempDb;
  beforeEach(() => {
    t = createTempDb();
  });
  afterEach(() => t.cleanup());

  it.each([1, 2, 3, 4, 5])(
    "seed %i: same postings, counts, scores and newest-first order, on vs off",
    (s) => {
      const random = rng(s);
      const ids = seed(t, random, 120);
      t.db.run(sql`insert into tracking_marks (posting_id, mark, marked_at, change_id)
                 select id, 'skipped', ${NOW}, id from collector_postings where status = 'open' limit 7`);
      const matches = new Map<string, MatchView>();
      for (const id of ids)
        matches.set(
          id,
          random() < 0.3 ? notScored("pending", "waiting to be scored") : scored(Math.floor(random() * 101)),
        );

      for (const order of ["newest", "best_match"] as const)
        for (const profile of [true, false])
          for (const filter of [true, false]) {
            setRemoteFilterSettings(t.db, { country: filter ? "PL" : null, filterOn: filter });
            const build = (on: boolean) => {
              setOn({ db: t.db }, on);
              const deps: SearchDeps = {
                db: t.db,
                now: () => NOW,
                scores: fakeScoreReader(matches, { hasProfile: profile }),
              };
              openVisit(deps);
              const snapshots = createSnapshotStore(deps.now);
              const first = runSearch(deps, snapshots, "", order);
              return { first, items: allPages(deps, snapshots, first) };
            };
            const on = build(true);
            const off = build(false);
            const label = `seed ${s} ${order} profile=${profile} filter=${filter}`;
            const counts = (r: Result) => [r.total, r.new_count, r.marked_count, r.hidden_count];
            expect(counts(on.first), label).toEqual(counts(off.first));
            expect(new Set(on.items.map((p) => p.id)), label).toEqual(new Set(off.items.map((p) => p.id)));
            expect(on.items, label).toHaveLength(on.first.total);
            const matchOf = (items: typeof on.items) => new Map(items.map((p) => [p.id, p.match]));
            expect(matchOf(on.items), label).toEqual(matchOf(off.items));
            if (order === "newest")
              expect(
                on.items.map((p) => p.id),
                label,
              ).toEqual(off.items.map((p) => p.id));
            for (const p of on.items) if (p.realness) expect(p.realness.penalty).toBeLessThanOrEqual(30);
            expect(
              off.items.every((p) => p.realness === null),
              label,
            ).toBe(true);
            expect(
              on.items.some((p) => p.realness !== null),
              label,
            ).toBe(true);
          }
    },
  );
});

describe("realness costs nothing (QG-3, AC-13)", () => {
  let t: TempDb;
  beforeEach(() => {
    t = createTempDb();
  });
  afterEach(() => t.cleanup());

  // With the scorer running, every provider request and every spend row is one posting's score — realness
  // adds neither — and the day is the same with realness on and off (review F-10). Realness assesses with
  // the switch off too, so on-vs-off alone could not catch it.
  async function day(on: boolean) {
    const t = createTempDb();
    seed(t, rng(9), 40);
    seedProfile(t.db);
    setOn({ db: t.db }, on);
    const provider = fakeProvider();
    const app = await buildApp({
      port: 3000,
      collector: { databaseFile: t.file, scheduler: false },
      matching: { provider, scorer: true, env: { ANTHROPIC_API_KEY: "sk-test-not-a-real-key" } },
    });
    await app.ready();
    const inject = (method: "GET" | "POST", url: string, payload?: object) =>
      app.inject({ method, url, headers: { host: "127.0.0.1:3000" }, ...(payload ? { payload } : {}) });
    const settled = () =>
      vi.waitFor(
        async () => expect((await inject("GET", "/api/v1/matching/health")).json().pending_count).toBe(0),
        { timeout: 10_000 },
      );
    await inject("POST", "/api/v1/search/snapshots", { skills: "" });
    await settled();
    for (const order of ["best_match", "newest"]) {
      const res = await inject("POST", "/api/v1/search/snapshots", { skills: "", order });
      expect(res.json().realness_on).toBe(on);
      const id = res.json().items[0]?.id;
      if (id) await inject("POST", `/api/v1/tracking/marks/${id}`, { mark: "skipped" });
    }
    await settled();
    const spend = t.db.all(
      sql`select kind, model, outcome, count(*) as calls, sum(coalesce(settled_usd_micros, reserved_usd_micros)) as usd_micros
          from matching_spend group by kind, model, outcome order by kind, model, outcome`,
    );
    const asked = provider.sent.map((p) => JSON.stringify(p.messages)).sort();
    const [counts] = t.db.all<{ spent: number; scored: number }>(
      sql`select (select count(*) from matching_spend) as spent, (select count(*) from matching_scores) as scored`,
    );
    await app.close();
    t.cleanup();
    return { asked, spend, counts };
  }

  it("asks the provider the same and spends the same with realness on and off", async () => {
    const on = await day(true);
    const off = await day(false);
    for (const run of [on, off]) {
      expect(run.counts?.scored).toBeGreaterThan(0); // the scorer did run
      expect(run.asked).toHaveLength(run.counts?.scored ?? -1);
      expect(run.counts?.spent).toBe(run.counts?.scored);
    }
    expect(on.asked).toEqual(off.asked);
    expect(on.spend).toEqual(off.spend);
  }, 30_000);

  it("the realness module imports no provider or matching code", () => {
    const dir = fileURLToPath(new URL("../src/modules/realness/", import.meta.url));
    const files = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
    for (const f of files(dir).filter((f) => f.endsWith(".ts"))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/from "[^"]*(matching|anthropic)[^"]*"/);
    }
  });
});
