import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dailyCleanup } from "../src/modules/collector/app/cleanup.js";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { type MarkedPostings, noMarks } from "../src/modules/collector/app/marked-postings.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { readState } from "../src/modules/collector/infra/repo/state.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 2, 12);
type Row = Record<string, unknown>;

const fakeMarks = (marked: string[]): MarkedPostings => ({ markedAmong: async () => new Set(marked) });

describe("daily clean-up (Flow 9)", () => {
  let db: TempDb;
  let dir: string;
  let deps: CollectorDeps;

  beforeEach(() => {
    db = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-cleanup-"));
    deps = {
      db: db.db,
      now: () => NOW,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: "http://127.0.0.1:1" }),
      timeZone: "Europe/Warsaw",
    };
    startUp(deps);
  });

  afterEach(() => {
    db.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const rows = (q: string) => db.db.all<Row>(sql.raw(q));
  function posting(
    id: string,
    over: { status?: string; closedAt?: number | null; lastOfferedAt: number; source?: string },
  ) {
    db.db.run(sql`insert into collector_postings (id, match_key, title, company, first_found_at, status, closed_at, last_offered_at)
      values (${id}, ${id}, 'T', 'C', 0, ${over.status ?? "open"}, ${over.closedAt ?? null}, ${over.lastOfferedAt})`);
    db.db.run(sql`insert into collector_listings (id, posting_id, source_id, source_item_id, url, title, company, description,
        categories, first_collected_at, is_first_fill, last_seen_at, last_seen_run_id, status)
      values (${`l-${id}`}, ${id}, ${over.source ?? "remotive"}, ${id}, 'https://jobs.example.test', 'T', 'C', '', '[]', 0, 0, 0, 'r', 'open')`);
  }
  const ids = () => rows("select id from collector_postings order by id").map((r) => r.id);

  it("removes unmarked postings past retention with their listings, and keeps marked ones (AC-10)", async () => {
    posting("closed-old", { status: "closed", closedAt: NOW - 61 * DAY, lastOfferedAt: NOW - 61 * DAY });
    posting("closed-old-marked", {
      status: "closed",
      closedAt: NOW - 90 * DAY,
      lastOfferedAt: NOW - 90 * DAY,
    });
    posting("stale-open", { lastOfferedAt: NOW - 61 * DAY });
    posting("recent", { status: "closed", closedAt: NOW - 59 * DAY, lastOfferedAt: NOW - 59 * DAY });

    const result = await dailyCleanup(deps, "2026-10-02", fakeMarks(["closed-old-marked"]));

    expect(result).toEqual({ ran: true, removed: 2 });
    expect(ids()).toEqual(["closed-old-marked", "recent"]);
    expect(rows("select posting_id from collector_listings order by posting_id")).toEqual([
      { posting_id: "closed-old-marked" },
      { posting_id: "recent" },
    ]);
  });

  it("does not count days on which all of a posting's sources were disabled (AC-26)", async () => {
    posting("paused", { lastOfferedAt: NOW - 70 * DAY, source: "jobicy" });
    db.db.run(sql`insert into collector_source_disabled_periods (id, source_id, disabled_from, disabled_until)
      values ('d1', 'jobicy', ${NOW - 40 * DAY}, ${NOW - 20 * DAY})`);

    await dailyCleanup(deps, "2026-10-02", noMarks);

    expect(ids()).toEqual(["paused"]); // 70 - 20 = 50 counted days
  });

  it("removes nothing when the marks port fails — a mark must never be lost", async () => {
    posting("closed-old", { status: "closed", closedAt: NOW - 61 * DAY, lastOfferedAt: NOW - 61 * DAY });
    const failing: MarkedPostings = {
      markedAmong: async () => {
        throw new Error("tracking module unavailable");
      },
    };

    const result = await dailyCleanup(deps, "2026-10-02", failing);

    expect(result).toEqual({ ran: true, removed: 0 });
    expect(ids()).toEqual(["closed-old"]);
  });

  it("runs at most once per calendar day", async () => {
    posting("closed-old", { status: "closed", closedAt: NOW - 61 * DAY, lastOfferedAt: NOW - 61 * DAY });
    await dailyCleanup(deps, "2026-10-02", fakeMarks(["closed-old"]));

    const second = await dailyCleanup(deps, "2026-10-02", noMarks);

    expect(second).toEqual({ ran: false, removed: 0 });
    expect(ids()).toEqual(["closed-old"]);
    expect(readState(db.db).lastCleanupOn).toBe("2026-10-02");
  });

  it("prunes ledger entries older than 24 h, runs and sessions older than 60 days", async () => {
    db.db.run(
      sql`insert into collector_request_ledger (id, source_id, sent_at) values ('old', 'jobicy', ${NOW - 25 * HOUR}), ('new', 'jobicy', ${NOW - HOUR})`,
    );
    db.db.run(
      sql`insert into collector_runs (id, trigger, status, started_at) values ('r-old', 'schedule', 'finished', ${NOW - 61 * DAY}), ('r-new', 'schedule', 'finished', ${NOW - DAY})`,
    );
    db.db.run(
      sql`insert into collector_app_sessions (id, started_at, last_seen_at) values ('s-old', 0, ${NOW - 61 * DAY})`,
    );

    await dailyCleanup(deps, "2026-10-02", noMarks);

    expect(rows("select id from collector_request_ledger")).toEqual([{ id: "new" }]);
    expect(rows("select id from collector_runs")).toEqual([{ id: "r-new" }]);
    expect(rows("select id from collector_app_sessions where id = 's-old'")).toEqual([]);
  });
});
