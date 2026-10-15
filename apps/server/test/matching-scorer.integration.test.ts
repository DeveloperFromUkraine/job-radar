import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMatchingConfig } from "../src/core/config.js";
import { type OpenPosting, postingsByIds } from "../src/modules/collector/app/open-postings.js";
import { removePostings } from "../src/modules/collector/infra/repo/postings.js";
import type { MatchingDeps } from "../src/modules/matching/app/deps.js";
import { getScoringHealth } from "../src/modules/matching/app/health.js";
import { createScoreReader } from "../src/modules/matching/app/score-reader.js";
import { scoredText } from "../src/modules/matching/app/scored-text.js";
import { createScorer, PROVIDER_RETRY_MS } from "../src/modules/matching/app/scorer.js";
import { saveProfile, setCap } from "../src/modules/matching/app/settings.js";
import type { Profile } from "../src/modules/matching/domain/profile.js";
import { maxCostMicros } from "../src/modules/matching/domain/spend.js";
import { createMatching } from "../src/modules/matching/index.js";
import { requestBytes, scoreRequest } from "../src/modules/matching/infra/prompts.js";
import { readSettings, scoresFor } from "../src/modules/matching/infra/repo.js";
import { matchingSpend } from "../src/modules/matching/infra/schema.js";
import { type FakeProvider, fakeProvider, problem, scoreAnswer } from "./helpers/fake-provider.js";
import { AC01_PROFILE, seedProfile } from "./helpers/matching-fixtures.js";
import { seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const MIN = 60_000;
let now: number;
let t: TempDb;
let provider: FakeProvider;
let deps: MatchingDeps;
let list: OpenPosting[];

beforeEach(() => {
  t = createTempDb();
  now = Date.UTC(2026, 9, 20, 10);
  provider = fakeProvider(scoreAnswer());
  deps = {
    db: t.db,
    now: () => now,
    timeZone: "Europe/Warsaw",
    config: loadMatchingConfig({ ANTHROPIC_API_KEY: "sk-test-not-a-real-key" }),
    provider,
    wakeScorer: () => {},
  };
  list = [];
});
afterEach(() => t.cleanup());

/** `n` postings, newest first (as the owner's list is). */
function addPostings(n: number, from = 1) {
  const ids = seedOpenPostings(t.db, n, (i) => ({ firstFoundAt: from + i, title: `Role ${from + i}` }));
  return postingsByIds(t.db, ids).sort((a, b) => b.firstFoundAt - a.firstFoundAt);
}
/** The posting titles the provider was asked about, in order. */
const asked = (p: FakeProvider = provider) =>
  p.sent.map((r) => /Title: (Role \d+)/.exec(String(r.messages[0]?.content))?.[1] ?? "?");
const scorer = () => createScorer(deps, { ownerList: () => list });

describe("the scorer's queue (flow 1, AC-13, AC-21)", () => {
  it("scores the first profile's list newest first, within the cap (AC-21)", async () => {
    seedProfile(t.db);
    list = addPostings(4);
    const s = scorer();
    await s.pass();
    expect(
      scoresFor(
        t.db,
        list.map((p) => p.id),
      ).size,
    ).toBe(4);
    expect(asked()).toEqual(["Role 4", "Role 3", "Role 2", "Role 1"]);
  });

  it("skips a posting seen again unchanged: nothing spent (AC-06)", async () => {
    seedProfile(t.db);
    list = addPostings(2);
    const s = scorer();
    await s.pass();
    await s.pass();
    expect(provider.sent).toHaveLength(2);
  });

  it("after a profile change, redoes stale scores only after every unscored posting (AC-10)", async () => {
    seedProfile(t.db);
    const old = addPostings(2, 1);
    list = old;
    const s = scorer();
    await s.pass();
    saveProfile(deps, { ...AC01_PROFILE, seniority: "staff" }); // every score is now stale
    const fresh = addPostings(2, 100);
    list = [...fresh, ...old];
    provider.sent.length = 0;
    await s.pass();
    const scoredAt = (id: string) => scoresFor(t.db, [id]).get(id)?.profileVersion;
    expect(list.every((p) => scoredAt(p.id) === 2)).toBe(true);
    // the two never-scored postings first, then the two stale ones, each newest first
    expect(asked()).toEqual(["Role 101", "Role 100", "Role 2", "Role 1"]);
  });

  it("does not score a posting marked or hidden before its turn (AC-13)", async () => {
    seedProfile(t.db);
    const all = addPostings(3);
    list = all;
    let calls = 0;
    deps.provider = fakeProvider(() => {
      calls++;
      if (calls === 1) list = all.slice(0, 2); // the third leaves the list before its turn
      return scoreAnswer();
    });
    await scorer().pass();
    expect(calls).toBe(2);
    expect(scoresFor(t.db, [all[2]?.id as string]).size).toBe(0);
  });

  it("stops at the cap and scores nothing more this month (AC-12)", async () => {
    seedProfile(t.db, { capUsdMicros: 100_000 }); // room for one attempt's reservation only
    list = addPostings(3);
    await scorer().pass();
    expect(provider.sent.length).toBeLessThan(3);
  });

  it("a refused reservation counts as cap reached on the cards and in health, until the cap is raised (AC-12, R1)", async () => {
    // $0.10 left: above the no-input bound ($0.08), below any real request's reservation.
    seedProfile(t.db, { capUsdMicros: 100_000 });
    list = addPostings(2);
    await scorer().pass();
    expect(provider.sent).toHaveLength(0);
    const states = () => [...createScoreReader(deps).matchesFor(list).values()].map((m) => m.state);
    expect(states()).toEqual(["cap_reached", "cap_reached"]);
    const health = getScoringHealth(deps, () => list);
    expect(health.capReached).toBe(true);
    expect(health.resumesOn).not.toBeNull();
    expect(health.problem?.kind).toBe("cap_reached");

    setCap(deps, 800); // $8
    expect(states()).toEqual(["pending", "pending"]);
    expect(getScoringHealth(deps, () => list).capReached).toBe(false);
  });

  it("a refused large posting does not hold back a smaller one once it leaves the list (AC-12, R23)", async () => {
    seedProfile(t.db);
    const ids = seedOpenPostings(t.db, 2, (i) => ({
      firstFoundAt: i + 1,
      title: `Role ${i + 1}`,
      description: i === 1 ? "x ".repeat(100_000) : "We build remote-first software.",
    }));
    const [big, small] = postingsByIds(t.db, ids).sort((a, b) => b.firstFoundAt - a.firstFoundAt);
    const profile = readSettings(t.db).profile as Profile;
    const cost = (p: OpenPosting) =>
      maxCostMicros(
        requestBytes(scoreRequest(deps.config, profile, scoredText(p))),
        deps.config.scoreOutputLimit,
        deps.config.price,
      );
    // Room for the small posting's reservation, not the large one's.
    setCap(deps, Math.floor((cost(small as OpenPosting) + cost(big as OpenPosting)) / 2 / 10_000));
    list = [big, small] as OpenPosting[];
    const s = scorer();
    await s.pass();
    expect(asked()).toEqual([]);

    list = [small as OpenPosting]; // the owner marks the large one
    await s.pass();
    expect(asked()).toEqual(["Role 1"]);
    expect(getScoringHealth(deps, () => list).capReached).toBe(false);
  });

  it("does nothing without a profile", async () => {
    list = addPostings(2);
    await scorer().pass();
    expect(provider.sent).toHaveLength(0);
  });
});

describe("retries (AC-14)", () => {
  it("after an unreachable provider, tries again at most every 15 minutes and recovers by itself", async () => {
    seedProfile(t.db);
    list = addPostings(2);
    deps.provider = fakeProvider(problem("provider_unreachable"), scoreAnswer());
    const s = scorer();
    await s.pass();
    expect(readSettings(t.db).scoringProblem).toBe("provider_unreachable");
    now += PROVIDER_RETRY_MS - MIN;
    await s.pass(); // too soon: nothing sent
    expect(
      scoresFor(
        t.db,
        list.map((p) => p.id),
      ).size,
    ).toBe(0);
    now += MIN;
    await s.pass();
    expect(
      scoresFor(
        t.db,
        list.map((p) => p.id),
      ).size,
    ).toBe(2);
    expect(readSettings(t.db).scoringProblem).toBe(null);
  });

  it("after a refused key, never retries until restart; a new scorer (restart) tries again", async () => {
    seedProfile(t.db);
    list = addPostings(1);
    const sent: string[] = [];
    deps.provider = fakeProvider(() => {
      sent.push("x");
      return sent.length === 1 ? problem("key_refused") : scoreAnswer();
    });
    const s = scorer();
    await s.pass();
    now += 24 * 60 * MIN;
    await s.pass();
    expect(sent).toHaveLength(1);
    await scorer().pass(); // restarted with a key
    expect(sent).toHaveLength(2);
  });
});

describe("lifecycle", () => {
  it("wake() runs a pass now, and a wake during a pass runs another after it", async () => {
    seedProfile(t.db);
    list = addPostings(1);
    let release: () => void = () => {};
    deps.provider = fakeProvider(
      () =>
        new Promise((resolve) => {
          release = () => resolve(scoreAnswer());
        }),
    );
    const s = createScorer(deps, { ownerList: () => list, intervalMs: 3_600_000 });
    s.start();
    await new Promise((r) => setTimeout(r, 10));
    list = [...addPostings(1, 50), ...list];
    s.wake();
    release();
    await new Promise((r) => setTimeout(r, 10));
    release();
    await s.stop();
    expect(
      scoresFor(
        t.db,
        list.map((p) => p.id),
      ).size,
    ).toBe(2);
  });

  it("stop() waits for the attempt in flight, then starts no more", async () => {
    seedProfile(t.db);
    list = addPostings(3);
    let release: () => void = () => {};
    let calls = 0;
    deps.provider = fakeProvider(
      () =>
        new Promise((resolve) => {
          calls++;
          release = () => resolve(scoreAnswer());
        }),
    );
    const s = createScorer(deps, { ownerList: () => list, intervalMs: 3_600_000 });
    s.start();
    await new Promise((r) => setTimeout(r, 10));
    const stopped = s.stop();
    release();
    await stopped;
    expect(calls).toBe(1);
    expect(
      scoresFor(
        t.db,
        list.map((p) => p.id),
      ).size,
    ).toBe(1);
  });
});

describe("the scorer's lifecycle (AC-14, ADR-0003; review R8, R10, R11)", () => {
  const outcomes = () =>
    t.db
      .select({ o: matchingSpend.outcome })
      .from(matchingSpend)
      .all()
      .map((r) => r.o);

  it("wakes itself when the 15-minute retry is due, without waiting for the next poll (R8)", async () => {
    vi.useFakeTimers();
    try {
      seedProfile(t.db);
      list = addPostings(1);
      deps.provider = fakeProvider(problem("provider_unreachable"), scoreAnswer());
      const s = createScorer(deps, { ownerList: () => list, intervalMs: 60 * MIN });
      s.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(readSettings(t.db).scoringProblem).toBe("provider_unreachable");
      now += PROVIDER_RETRY_MS;
      await vi.advanceTimersByTimeAsync(PROVIDER_RETRY_MS);
      expect(scoresFor(t.db, [list[0]?.id as string]).size).toBe(1);
      await s.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() aborts a provider call in flight and leaves no reservation open or problem recorded (R10)", async () => {
    seedProfile(t.db);
    list = addPostings(1);
    let asked = false;
    deps.provider = {
      send: (_params, opts) =>
        new Promise((resolve) => {
          asked = true;
          opts?.signal?.addEventListener("abort", () =>
            resolve({ kind: "problem", problem: "provider_unreachable", detail: "aborted" }),
          );
        }),
    };
    const s = createScorer(deps, { ownerList: () => list, intervalMs: 60 * MIN });
    s.start();
    await vi.waitFor(() => expect(asked).toBe(true));
    await s.stop();
    expect(outcomes()).toEqual(["no_answer"]);
    expect(readSettings(t.db).scoringProblem).toBe(null);
  }, 2000);

  it("asks the provider with the score timeout, not the draft one (R10)", async () => {
    seedProfile(t.db);
    list = addPostings(1);
    const seen: (number | undefined)[] = [];
    deps.provider = {
      send: async (_params, opts) => {
        seen.push(opts?.timeoutMs);
        return scoreAnswer();
      },
    };
    await createScorer(deps, { ownerList: () => list }).pass();
    expect(seen).toEqual([deps.config.scoreTimeoutMs]);
  });

  it("settles the reservation when the posting is removed during the call, and logs the failed pass (R11)", async () => {
    seedProfile(t.db);
    const added = addPostings(1);
    const warn = vi.fn();
    const m = createMatching({
      db: t.db,
      now: () => now,
      timeZone: "Europe/Warsaw",
      config: deps.config,
      ownerList: () => added,
      provider: fakeProvider(() => {
        removePostings(t.db, [added[0]?.id as string]);
        return scoreAnswer();
      }),
    });
    m.deps.log = { info: () => {}, warn };
    m.scorer.wake();
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ module: "matching" }),
        "scoring pass failed",
      ),
    );
    expect(outcomes()).toEqual(["answered"]);
    await m.scorer.stop();
  });
});
