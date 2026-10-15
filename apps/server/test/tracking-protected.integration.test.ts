import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dailyCleanup } from "../src/modules/collector/app/cleanup.js";
import type { CollectorDeps } from "../src/modules/collector/app/deps.js";
import { startUp } from "../src/modules/collector/app/startup.js";
import { createAdapters } from "../src/modules/collector/infra/sources/index.js";
import { protectedPostings } from "../src/modules/tracking/app/protected-postings.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TZ = "Europe/Warsaw";
// 2026-10-07 12:00 UTC = 14:00 in Warsaw.
const NOW = Date.UTC(2026, 9, 7, 12);

describe("clean-up with real marks (AC-07, AC-09)", () => {
  let t: TempDb;
  let dir: string;
  let clock: number;
  let deps: CollectorDeps;

  beforeEach(() => {
    t = createTempDb();
    dir = mkdtempSync(join(tmpdir(), "job-radar-protected-"));
    clock = NOW;
    deps = {
      db: t.db,
      now: () => clock,
      settingsFile: join(dir, "settings.json"),
      adapters: createAdapters({ baseUrl: "http://127.0.0.1:1" }),
      timeZone: TZ,
    };
    startUp(deps);
  });
  afterEach(() => {
    t.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });

  const port = () => protectedPostings({ db: t.db, now: () => clock, timeZone: TZ });
  function oldClosed(id: string) {
    t.db.run(sql`insert into collector_postings (id, match_key, title, company, first_found_at, status, closed_at, last_offered_at)
      values (${id}, ${id}, 'T', 'C', 0, 'closed', ${NOW - 90 * DAY}, ${NOW - 90 * DAY})`);
  }
  const ids = () =>
    t.db.all<{ id: string }>(sql`select id from collector_postings order by id`).map((r) => r.id);
  const markRows = () =>
    t.db.all<{ posting_id: string }>(sql`select posting_id from tracking_marks order by posting_id`);

  it("removes a skipped posting like an unmarked one and keeps an applied one for good (AC-09)", async () => {
    for (const id of ["applied", "skipped", "unmarked"]) oldClosed(id);
    seedMarks(t.db, ["applied"], { mark: "applied" });
    seedMarks(t.db, ["skipped"], { mark: "skipped" });

    const result = await dailyCleanup(deps, "2026-10-07", port());

    expect(result).toEqual({ ran: true, removed: 2 });
    expect(ids()).toEqual(["applied"]);
    expect(markRows()).toEqual([{ posting_id: "applied" }]); // the skipped mark went with its posting
  });

  it("keeps a posting through its grace day after it lost applied, and removes it the day after (AC-07)", async () => {
    oldClosed("lost");
    // Applied was cleared yesterday at 23:30 Warsaw time.
    seedMarks(t.db, ["lost"], { mark: null, appliedLostAt: Date.UTC(2026, 9, 6, 21, 30) });

    await dailyCleanup(deps, "2026-10-07", port());
    expect(ids()).toEqual(["lost"]);

    clock = NOW + DAY;
    await dailyCleanup(deps, "2026-10-08", port());
    expect(ids()).toEqual([]);
  });

  it("removes a cleared posting that never lost applied", async () => {
    oldClosed("cleared");
    seedMarks(t.db, ["cleared"], { mark: null });
    await dailyCleanup(deps, "2026-10-07", port());
    expect(ids()).toEqual([]);
  });
});
