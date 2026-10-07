import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppError } from "../src/core/errors.js";
import type { TrackingDeps } from "../src/modules/tracking/app/deps.js";
import { setMark, undoMark } from "../src/modules/tracking/app/marks.js";
import { getMark } from "../src/modules/tracking/infra/repo.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

const DAY = 24 * 60 * 60 * 1000;
// 2026-10-07 09:15 UTC = 12:15 in Kyiv.
const NOW = Date.UTC(2026, 9, 7, 9, 15);

describe("mark use cases (Flows 1 and 4)", () => {
  let t: TempDb;
  let deps: TrackingDeps;
  let clock: number;
  let logged: object[];

  beforeEach(() => {
    t = createTempDb();
    clock = NOW;
    logged = [];
    deps = {
      db: t.db,
      now: () => clock,
      timeZone: "Europe/Kyiv",
      log: { info: (obj) => logged.push(obj) },
    };
  });
  afterEach(() => t.cleanup());

  function aged(id: string, status: "open" | "closed", daysAgo: number) {
    t.db.run(
      sql`update collector_postings set status = ${status}, closed_at = ${status === "closed" ? NOW - daysAgo * DAY : null},
          last_offered_at = ${NOW - daysAgo * DAY} where id = ${id}`,
    );
  }
  const errorOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (err) {
      return err as AppError;
    }
    throw new Error("expected an error");
  };

  it("marks a posting applied and returns its state (AC-01)", () => {
    const p = addPosting(t.db, { title: "Senior Backend Engineer", company: "ACME" });
    aged(p, "open", 1); // the fixture's default offer time is decades old
    const state = setMark(deps, p, "applied");
    expect(state).toEqual({
      posting_id: p,
      mark: "applied",
      marked_at: "2026-10-07T09:15:00.000Z",
      change_id: expect.any(String),
      at_risk: false,
      removed_after: null,
    });
    expect(getMark(t.db, p)?.changeId).toBe(state.change_id);
  });

  it("writes only this posting's row when skipping (AC-02)", () => {
    const [a, b] = [addPosting(t.db, { company: "Acme" }), addPosting(t.db, { company: "Acme" })];
    setMark(deps, a, "skipped");
    expect(getMark(t.db, b)).toBeNull();
  });

  it("replaces a mark and its date on a change (AC-06)", () => {
    const p = addPosting(t.db);
    setMark(deps, p, "applied");
    clock = NOW + 60_000;
    expect(setMark(deps, p, "skipped")).toMatchObject({
      mark: "skipped",
      marked_at: "2026-10-07T09:16:00.000Z",
    });
  });

  it("keeps the original date when the same mark is set again", () => {
    const p = addPosting(t.db);
    const first = setMark(deps, p, "applied");
    clock = NOW + 60_000;
    expect(setMark(deps, p, "applied")).toEqual(first);
  });

  it("flags an applied posting past the 60-day rule as at risk (AC-07)", () => {
    const p = addPosting(t.db);
    aged(p, "closed", 61);
    expect(setMark(deps, p, "applied").at_risk).toBe(true);
  });

  it("shows a cleared closed posting's removal date: the later of grace end and retention (AC-07)", () => {
    const p = addPosting(t.db);
    aged(p, "closed", 61);
    setMark(deps, p, "applied");
    expect(setMark(deps, p, null)).toMatchObject({ mark: null, at_risk: true, removed_after: "2026-10-08" });
  });

  it("shows the retention date when it is later than the grace day", () => {
    const p = addPosting(t.db);
    aged(p, "closed", 10); // removable 50 days from now
    setMark(deps, p, "skipped");
    expect(setMark(deps, p, null).removed_after).toBe("2026-11-26");
  });

  it("gives no removal date for a cleared open posting (it is back in the main list)", () => {
    const p = addPosting(t.db);
    setMark(deps, p, "applied");
    expect(setMark(deps, p, null)).toMatchObject({ mark: null, removed_after: null });
  });

  it("undoes a first mark back to unmarked (AC-03)", () => {
    const p = addPosting(t.db);
    aged(p, "open", 1);
    const { change_id } = setMark(deps, p, "applied");
    expect(undoMark(deps, p, change_id as string)).toEqual({
      posting_id: p,
      mark: null,
      marked_at: null,
      change_id: null,
      at_risk: false,
      removed_after: null,
    });
    expect(getMark(t.db, p)).toBeNull();
  });

  it("undoes a change back to the previous mark with its original date (AC-03)", () => {
    const p = addPosting(t.db);
    setMark(deps, p, "applied");
    clock = NOW + 60_000;
    const { change_id } = setMark(deps, p, "skipped");
    expect(undoMark(deps, p, change_id as string)).toMatchObject({
      mark: "applied",
      marked_at: "2026-10-07T09:15:00.000Z",
    });
  });

  it("refuses an undo after the mark changed elsewhere (AC-04)", () => {
    const p = addPosting(t.db);
    const { change_id } = setMark(deps, p, "applied");
    setMark(deps, p, "skipped");
    setMark(deps, p, "applied");
    const err = errorOf(() => undoMark(deps, p, change_id as string));
    expect([err.statusCode, err.code]).toEqual([409, "TRACKING_MARK_CHANGED_ELSEWHERE"]);
    expect(getMark(t.db, p)?.mark).toBe("applied");
  });

  it("answers 404 for a posting clean-up removed, recording nothing (AC-15)", () => {
    const p = addPosting(t.db);
    const { change_id } = setMark(deps, p, "skipped");
    t.db.run(sql`delete from collector_listings where posting_id = ${p}`);
    t.db.run(sql`delete from collector_postings where id = ${p}`);
    for (const call of [() => setMark(deps, p, "applied"), () => undoMark(deps, p, change_id as string)]) {
      const err = errorOf(call);
      expect([err.statusCode, err.code, err.message]).toEqual([
        404,
        "TRACKING_POSTING_NOT_FOUND",
        "This posting is no longer in job-radar.",
      ]);
    }
    expect(t.db.all(sql`select * from tracking_marks`)).toEqual([]);
  });

  it("answers 503 and writes nothing when marks cannot be saved (AC-14)", () => {
    const p = addPosting(t.db);
    const { change_id } = setMark(deps, p, "applied");
    t.db.run(sql`pragma query_only = on`);
    for (const call of [() => setMark(deps, p, "skipped"), () => undoMark(deps, p, change_id as string)]) {
      const err = errorOf(call);
      expect([err.statusCode, err.code, err.message]).toEqual([
        503,
        "TRACKING_MARKS_UNAVAILABLE",
        "Job-radar could not save your mark just now. Try again.",
      ]);
    }
    t.db.run(sql`pragma query_only = off`);
    expect(getMark(t.db, p)?.mark).toBe("applied");
  });

  it("logs the action and duration, never the title or company", () => {
    const p = addPosting(t.db, { title: "Secret Title", company: "Secret Co" });
    setMark(deps, p, "applied");
    expect(logged).toEqual([{ action: "mark", durationMs: expect.any(Number) }]);
    expect(JSON.stringify(logged)).not.toMatch(/Secret/);
  });
});
