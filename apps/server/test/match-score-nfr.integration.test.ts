// match-score spec §6 NFRs that run in the gate, with the stand-in provider and a fake clock
// (test-plan.md §NFR validation). The real-model ones run in scripts/eval-match-score.ts, by hand.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMatchingConfig } from "../src/core/config.js";
import { type OpenPosting, postingsByIds } from "../src/modules/collector/app/open-postings.js";
import { scoreOne } from "../src/modules/matching/app/attempt.js";
import { draftProfileFromCv } from "../src/modules/matching/app/cv-draft.js";
import type { MatchingDeps } from "../src/modules/matching/app/deps.js";
import { createScorer } from "../src/modules/matching/app/scorer.js";
import { agreeNotice, saveProfile } from "../src/modules/matching/app/settings.js";
import type { ProviderOutcome } from "../src/modules/matching/infra/claude.js";
import { monthSpend } from "../src/modules/matching/infra/repo.js";
import { matchingScores } from "../src/modules/matching/infra/schema.js";
import type { MatchView, SearchDeps } from "../src/modules/search/app/deps.js";
import { nextPage } from "../src/modules/search/app/pages.js";
import { runSearch } from "../src/modules/search/app/search.js";
import { createSnapshotStore } from "../src/modules/search/app/snapshots.js";
import { openVisit } from "../src/modules/search/app/visits.js";
import { fakeProvider, problem, scoreAnswer } from "./helpers/fake-provider.js";
import { AC01_PROFILE, seedProfile } from "./helpers/matching-fixtures.js";
import { setRemoteFilterSettings } from "./helpers/remote-filter-fixtures.js";
import { fakeScoreReader, scored } from "./helpers/score-reader.js";
import { addPosting, seedOpenPostings } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

const MIN = 60_000;
let t: TempDb;
let now: number;
let deps: MatchingDeps;

beforeEach(() => {
  t = createTempDb();
  now = Date.UTC(2026, 9, 20, 10);
  deps = {
    db: t.db,
    now: () => now,
    timeZone: "Europe/Warsaw",
    config: loadMatchingConfig({ ANTHROPIC_API_KEY: "sk-test-not-a-real-key" }),
    provider: fakeProvider(scoreAnswer()),
    wakeScorer: () => {},
  };
});
afterEach(() => t.cleanup());

/** A small seeded random generator, so a failing case can be replayed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("Never a hide by score (AC-02)", () => {
  it.each([1, 2, 3, 4, 5])(
    "the list with and without scores holds the same postings and counts (seed %d)",
    (seed) => {
      const r = rng(seed);
      setRemoteFilterSettings(t.db, { country: "PL" });
      const ids = Array.from({ length: 20 + Math.floor(r() * 120) }, (_, i) =>
        addPosting(t.db, {
          title: r() < 0.7 ? "Go engineer" : "Designer",
          firstFoundAt: i + 1,
          listings: [{ locationRestriction: r() < 0.2 ? "USA" : r() < 0.5 ? null : "Europe" }],
        }),
      );
      seedMarks(
        t.db,
        ids.filter(() => r() < 0.1),
        { mark: "skipped" },
      );
      const matches = new Map<string, MatchView>(
        ids.filter(() => r() < 0.8).map((id) => [id, scored(Math.floor(r() * 101))]),
      );
      const searchDeps: SearchDeps = { db: t.db, now: () => now };
      openVisit(searchDeps);
      const skills = r() < 0.5 ? "Go" : "";
      const all = (scoresOn: boolean, order: "newest" | "best_match") => {
        const s = createSnapshotStore(searchDeps.now);
        const d = { ...searchDeps, scores: scoresOn ? fakeScoreReader(matches) : undefined };
        const first = runSearch(d, s, skills, order);
        const items = [...first.items];
        let cursor = first.next_cursor;
        while (cursor) {
          const p = nextPage(d, s, first.snapshot_id, cursor);
          items.push(...p.items);
          cursor = p.next_cursor;
        }
        return { first, ids: items.map((p) => p.id).sort() };
      };
      const plain = all(false, "newest");
      const counts = (x: typeof plain.first) => [x.total, x.new_count, x.marked_count, x.hidden_count];
      for (const order of ["newest", "best_match"] as const) {
        const withScores = all(true, order);
        expect(withScores.ids).toEqual(plain.ids);
        expect(counts(withScores.first)).toEqual(counts(plain.first));
      }
    },
  );
});

describe("Spending (AC-12, NFR Spending)", () => {
  it("1,000 attempts with charged failures and timeouts never pass the $5 cap; none starts after it", async () => {
    seedProfile(t.db);
    const [posting] = postingsByIds(t.db, seedOpenPostings(t.db, 1)) as [OpenPosting];
    const r = rng(42);
    let sent = 0;
    deps.provider = fakeProvider((params) => {
      sent++;
      const roll = r();
      const usage = {
        inputTokens: Math.floor(r() * 2_000),
        cacheWriteTokens: Math.floor(r() * 2_000),
        cacheReadTokens: Math.floor(r() * 2_000),
        outputTokens: Math.floor(r() * params.max_tokens),
      };
      const outcome: ProviderOutcome =
        roll < 0.6
          ? { ...(scoreAnswer() as Extract<ProviderOutcome, { kind: "answer" }>), usage }
          : roll < 0.85
            ? { kind: "answer", answer: { refusal: true }, usage } // charged, unusable
            : problem("provider_unreachable"); // no answer: counted at its maximum
      return outcome;
    });
    const cap = 5_000_000;
    let firstRefusal = -1;
    let sentAtRefusal = 0;
    for (let i = 0; i < 1_000; i++) {
      const result = await scoreOne(deps, posting, AC01_PROFILE, 1);
      expect(monthSpend(t.db, Date.UTC(2026, 9, 1) - 2 * 3_600_000)).toBeLessThanOrEqual(cap);
      if (result.kind === "cap_reached" && firstRefusal < 0) {
        firstRefusal = i;
        sentAtRefusal = sent;
      }
    }
    expect(firstRefusal).toBeGreaterThan(0);
    expect(sent).toBe(sentAtRefusal); // no attempt started after the cap was reached
  });
});

describe("No personal details sent (AC-09, NFR)", () => {
  it("neither the draft nor any scoring carries a name, email, phone, address or link", async () => {
    const cv = new TextEncoder().encode(
      [
        "Test User",
        "Senior TypeScript engineer, 8 years. React and Node.js.",
        "Email: user-0001@example.test · Phone: +48 000 000 000",
        "Address: 1 Example Street, Warsaw",
        "https://example.test/u/0001 · linkedin.com/in/test-user",
      ].join("\n"),
    );
    const provider = fakeProvider(
      {
        kind: "answer",
        answer: {
          skills: [
            { name: "TypeScript", core: true },
            { name: "user-0001@example.test", core: false },
          ],
          years: 8,
          seniority: "senior",
          role_types: ["fullstack"],
          min_salary: null,
          engagement_forms: [],
        },
        usage: { inputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 10 },
      },
      scoreAnswer(),
    );
    deps.provider = provider;
    agreeNotice(deps);
    const draft = await draftProfileFromCv(deps, { mediaType: "text/plain", bytes: cv });
    saveProfile(deps, draft.draft);
    const list = postingsByIds(t.db, seedOpenPostings(t.db, 5));
    await createScorer(deps, { ownerList: () => list }).pass();
    expect(provider.sent.length).toBe(6);
    const sent = provider.sentText();
    for (const detail of [
      "Test User",
      "user-0001@example.test",
      "+48 000 000 000",
      "1 Example Street",
      "example.test/u/0001",
      "linkedin.com/in/test-user",
    ])
      expect(sent).not.toContain(detail);
  });
});

describe("Scoring freshness (NFR: ≤ 15 min p95 while stale scores are redone)", () => {
  it("50 new postings an hour are each scored within 15 minutes during a re-score of 200 stale ones", async () => {
    // The NFR holds "while the cap is not reached": ~450 attempts need more than the $5 default.
    seedProfile(t.db, { profileVersion: 1, capUsdMicros: 100_000_000 });
    agreeNotice(deps);
    const stale = postingsByIds(
      t.db,
      seedOpenPostings(t.db, 200, (i) => ({ firstFoundAt: i + 1 })),
    );
    let list: OpenPosting[] = [...stale].sort((a, b) => b.firstFoundAt - a.firstFoundAt);
    // Score them all against version 1, then change the profile: all 200 are stale.
    await createScorer(deps, { ownerList: () => list }).pass();
    saveProfile(deps, { ...AC01_PROFILE, seniority: "staff" });

    const start = now;
    const arrivals: { posting: OpenPosting; at: number }[] = [];
    const waiting = postingsByIds(
      t.db,
      seedOpenPostings(t.db, 50, (i) => ({ firstFoundAt: 10_000 + i })),
    );
    const r = rng(7);
    // One new posting every 72 s (50 an hour) enters the list as time passes.
    const arrive = () => {
      while (waiting.length && now - start >= arrivals.length * 72_000) {
        const posting = waiting.shift() as OpenPosting;
        arrivals.push({ posting, at: now });
        list = [posting, ...list];
      }
    };
    deps.provider = fakeProvider(() => {
      now += 2_000 + Math.floor(r() * 3_000); // each scoring takes 2–5 s
      arrive();
      return scoreAnswer();
    });
    const scorer = createScorer(deps, { ownerList: () => list });
    // The scorer wakes every 60 s; drive passes until the hour is over and everything is scored.
    while (now - start < 75 * MIN) {
      arrive();
      await scorer.pass();
      now += MIN;
    }
    const latencies = arrivals.map(({ posting, at }) => scoredAt(posting.id) - at);
    const sorted = [...latencies].sort((a, b) => a - b);
    expect(arrivals).toHaveLength(50);
    expect(sorted[Math.ceil(sorted.length * 0.95) - 1]).toBeLessThanOrEqual(15 * MIN);
  });
});

/** When a posting's current score was stored; never scored reads as infinitely late. */
function scoredAt(postingId: string): number {
  const row = t.db.select().from(matchingScores).where(eq(matchingScores.postingId, postingId)).get();
  return row?.scoredAt ?? Number.POSITIVE_INFINITY;
}

describe("Draft profile time (NFR: ≤ 60 s p95 after a 5 MB upload)", () => {
  it("reads a 5 MB PDF and prepares the request well within the budget the provider leaves", async () => {
    const lines = Array.from(
      { length: 90_000 },
      (_, i) => `(Line ${i} TypeScript React Node.js experience) '`,
    );
    const content = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.join(" ")} ET`;
    const pdf = buildPdf(content);
    expect(pdf.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(pdf.length).toBeGreaterThan(4 * 1024 * 1024);
    agreeNotice(deps);
    deps.provider = fakeProvider({
      kind: "answer",
      answer: {
        skills: [{ name: "TypeScript", core: true }],
        years: null,
        seniority: null,
        role_types: [],
        min_salary: null,
        engagement_forms: [],
      },
      usage: { inputTokens: 10, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 10 },
    });
    const started = performance.now();
    await draftProfileFromCv(deps, { mediaType: "application/pdf", bytes: pdf });
    // The provider's own answer takes 10–20 s (test-plan); the local part must leave that room.
    expect(performance.now() - started).toBeLessThanOrEqual(40_000);
  }, 60_000);
});

function buildPdf(content: string): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
