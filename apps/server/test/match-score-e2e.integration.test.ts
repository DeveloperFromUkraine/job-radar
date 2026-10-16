// match-score end to end (test-plan.md E1–E3): the app with its scorer running, the database file and
// the stand-in provider, driven through HTTP. The real model is never called.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, runMigrations } from "../src/core/db.js";
import { loadContract } from "./helpers/contract.js";
import { type FakeProvider, fakeProvider, scoreAnswer } from "./helpers/fake-provider.js";
import { addPosting } from "./helpers/search-fixtures.js";

const contract = loadContract("match-score");
// The main list as restated by realness-score (adds realness and realness_on).
const listContract = loadContract("realness-score");
const headers = { host: "127.0.0.1:3000" };
const profile = {
  skills: [
    { name: "TypeScript", core: true },
    { name: "React", core: true },
  ],
  years: 8,
  seniority: "senior",
  role_types: ["fullstack"],
  min_salary: null,
  engagement_forms: ["b2b"],
};

let dir: string;
let databaseFile: string;
let app: FastifyInstance;
let provider: FakeProvider;

/** "Go engineer 3" → a skills part of 30 + 3·10 (capped at 100), so scores differ by posting. */
const answerFor = (title: string) => {
  const n = Number(/(\d+)$/.exec(title)?.[1] ?? 0);
  return scoreAnswer({
    skills: Math.min(100, 30 + n * 10),
    role_type: "not_stated",
    seniority: "not_stated",
    terms: "not_stated",
  });
};
const titleOf = (content: unknown) => /Title: (.+)/.exec(String(content))?.[1] ?? "?";

function seed(titles: string[], from: number) {
  const handle = openDb(databaseFile);
  const ids = titles.map((title, i) => addPosting(handle.db, { title, firstFoundAt: from + i }));
  handle.close();
  return ids;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "job-radar-match-e2e-"));
  databaseFile = join(dir, "job-radar.sqlite");
  const handle = openDb(databaseFile);
  runMigrations(handle.db);
  handle.close();
  provider = fakeProvider((params) => answerFor(titleOf(params.messages[0]?.content)));
  app = await buildApp({
    port: 3000,
    collector: { databaseFile, scheduler: false },
    matching: { provider, scorer: true, env: { ANTHROPIC_API_KEY: "sk-test-not-a-real-key" } },
  });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = async (method: "GET" | "POST", url: string, payload?: object) => {
  const res = await app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
  return res.json();
};
const search = async (skills: string, order?: "newest" | "best_match") => {
  const body = await call("POST", "/api/v1/search/snapshots", order ? { skills, order } : { skills });
  listContract.expectContract("runSearch", 200, body);
  return body;
};
const health = () => call("GET", "/api/v1/matching/health");
const settled = () =>
  vi.waitFor(async () => expect((await health()).pending_count).toBe(0), { timeout: 5_000 });
const asked = () => provider.sent.map((p) => titleOf(p.messages[0]?.content));

describe("E1: first profile → the list is scored newest first → best match first (AC-01, AC-11, AC-13, AC-21)", () => {
  it("scores the owner's list newest first, orders it best match first, then scores postings that newly enter", async () => {
    seed(["Go engineer 1", "Go engineer 2", "Go engineer 3"], 100);
    const designers = seed(["Designer 7", "Designer 8"], 200);
    await search("Go"); // the kept skills: only the Go postings are in the owner's list
    await call("POST", "/api/v1/matching/notice", {});
    const saved = await call("POST", "/api/v1/matching/profile", { profile });
    expect(saved.changed).toBe(true);
    await settled();
    expect(asked()).toEqual(["Go engineer 3", "Go engineer 2", "Go engineer 1"]);

    const best = await search("Go", "best_match");
    expect(best.has_profile).toBe(true);
    expect(best.items.map((p: { title: string }) => p.title)).toEqual([
      "Go engineer 3",
      "Go engineer 2",
      "Go engineer 1",
    ]);
    expect(best.items.every((p: { match: { state: string } }) => p.match.state === "scored")).toBe(true);

    // Widening the skills to the feed brings the designers in; they are scored in their turn.
    const feed = await search("");
    const pending = feed.items.filter((p: { id: string }) => designers.includes(p.id));
    expect(pending.every((p: { match: { state: string } }) => p.match.state === "pending")).toBe(true);
    await settled();
    expect(asked().slice(3)).toEqual(["Designer 8", "Designer 7"]);
  });
});

describe("E2: cap reached → raised → scoring resumes (AC-12, AC-19)", () => {
  it("stops at a $0 cap with the list and marks working, and resumes at once when raised", async () => {
    const [first] = seed(["Go engineer 1", "Go engineer 2"], 100);
    await call("POST", "/api/v1/matching/cap", { cap_usd_cents: 0 });
    await call("POST", "/api/v1/matching/notice", {});
    await call("POST", "/api/v1/matching/profile", { profile });
    await new Promise((r) => setTimeout(r, 50));
    expect(provider.sent).toHaveLength(0);

    const h = await health();
    contract.expectContract("getScoringHealth", 200, h);
    expect(h).toMatchObject({ cap_reached: true, problem: { kind: "cap_reached" } });
    const list = await search("");
    expect(list.total).toBe(2);
    expect(list.items.every((p: { match: { state: string } }) => p.match.state === "cap_reached")).toBe(true);
    const mark = await app.inject({
      method: "POST",
      url: `/api/v1/tracking/marks/${first}`,
      headers,
      payload: { mark: "applied" },
    });
    expect(mark.statusCode).toBe(200);

    await call("POST", "/api/v1/matching/cap", { cap_usd_cents: 800 });
    await settled();
    expect(asked()).toEqual(["Go engineer 2"]); // the marked one is no longer in the owner's list
    expect((await health()).cap_reached).toBe(false);
  });
});

describe("E3: profile edit → stale marks → re-scored after the unscored postings (AC-10)", () => {
  it("marks every score as scored against the previous profile and redoes them after new postings", async () => {
    seed(["Go engineer 1", "Go engineer 2"], 100);
    await search("");
    await call("POST", "/api/v1/matching/notice", {});
    await call("POST", "/api/v1/matching/profile", { profile });
    await settled();

    // Hold the scorer while the profile changes and a posting arrives, so the stale marks can be seen.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const prior = provider.sent.length;
    provider.send = ((send) => async (params) => {
      await gate;
      return send(params);
    })(provider.send.bind(provider));
    seed(["Go engineer 9"], 300);
    await call("POST", "/api/v1/matching/profile", { profile: { ...profile, seniority: "staff" } });
    const stale = await search("");
    const states = Object.fromEntries(
      stale.items.map((p: { title: string; match: { stale: string | null; state: string } }) => [
        p.title,
        p.match,
      ]),
    );
    expect(states["Go engineer 1"]).toMatchObject({ state: "scored", stale: "profile_changed" });
    expect(states["Go engineer 9"]).toMatchObject({ state: "pending" });
    release();
    await settled();
    await vi.waitFor(() => expect(provider.sent.length - prior).toBe(3), { timeout: 5_000 });
    expect(asked().slice(prior)).toEqual(["Go engineer 9", "Go engineer 2", "Go engineer 1"]);
  });
});
