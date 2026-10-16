import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setOn } from "../src/modules/realness/app/settings.js";
import { createRealness } from "../src/modules/realness/index.js";
import type { TrackingDeps } from "../src/modules/tracking/app/deps.js";
import { setMark, undoMark } from "../src/modules/tracking/app/marks.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";

// realness-score T09: realness kept with every mark and once a day (AC-14).
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 16, 10); // 12:00 in Warsaw
const TZ = "Europe/Warsaw";
type Row = Record<string, unknown>;

describe("mark records and daily shares (realness-score T09)", () => {
  let t: TempDb;
  let clock: number;
  let warned: object[];
  let realness: ReturnType<typeof createRealness>;
  let tracking: TrackingDeps;

  beforeEach(() => {
    t = createTempDb();
    clock = NOW;
    warned = [];
    realness = createRealness({
      db: t.db,
      now: () => clock,
      timeZone: TZ,
      log: { warn: (o) => warned.push(o) },
    });
    tracking = { db: t.db, now: () => clock, timeZone: TZ, onMarkChanged: realness.onMarkChanged };
  });
  afterEach(() => t.cleanup());

  const records = () =>
    t.db.all<Row>(sql`select posting_id, mark, penalty, signals, recorded_at from realness_mark_records`);
  const shares = () =>
    t.db.all<Row>(sql`select day, postings, lowered, recorded_at from realness_daily_shares`);
  const stale = () => addPosting(t.db, { firstFoundAt: NOW - 47 * DAY, listings: [{ payField: "" }] });
  const refuse = (table: string) =>
    t.db.run(
      sql.raw(
        `create trigger refuse_${table} before insert on ${table} begin select raise(abort, 'disk'); end;`,
      ),
    );

  describe("onMarkChanged (flow 7)", () => {
    it("keeps the posting's penalty and signals with its mark", () => {
      const id = stale();
      setMark(tracking, id, "applied");
      expect(records()).toEqual([
        {
          posting_id: id,
          mark: "applied",
          penalty: 15,
          signals: JSON.stringify([{ kind: "age", basis: "first_found", days: 47 }, { kind: "no_salary" }]),
          recorded_at: NOW,
        },
      ]);
    });

    it("an unlowered posting is kept with penalty 0 and no signals", () => {
      const id = addPosting(t.db, { firstFoundAt: NOW });
      setMark(tracking, id, "skipped");
      expect(records()).toMatchObject([{ posting_id: id, mark: "skipped", penalty: 0, signals: "[]" }]);
    });

    it("uses switch-on rules even with the switch off", () => {
      setOn(realness.deps, false);
      const id = stale();
      setMark(tracking, id, "applied");
      expect(records()).toMatchObject([{ penalty: 15 }]);
    });

    it("a changed mark keeps one record with the latest mark, recomputed now", () => {
      const id = stale();
      setMark(tracking, id, "applied");
      clock = NOW + 20 * DAY; // now 67 days old
      setMark(tracking, id, "skipped");
      expect(records()).toMatchObject([
        { posting_id: id, mark: "skipped", penalty: 25, recorded_at: NOW + 20 * DAY },
      ]);
    });

    it("clearing the mark, or undoing the only mark, removes the record", () => {
      const a = stale();
      setMark(tracking, a, "applied");
      setMark(tracking, a, null);
      expect(records()).toEqual([]);

      const b = stale();
      const state = setMark(tracking, b, "skipped");
      undoMark(tracking, b, state.change_id as string);
      expect(records()).toEqual([]);
    });

    it("undoing a change back to the earlier mark records the restored mark", () => {
      const id = stale();
      setMark(tracking, id, "applied");
      const changed = setMark(tracking, id, "skipped");
      undoMark(tracking, id, changed.change_id as string);
      expect(records()).toMatchObject([{ posting_id: id, mark: "applied" }]);
    });

    it("a record that cannot be written is logged and the mark stands", () => {
      refuse("realness_mark_records");
      const id = stale();
      expect(setMark(tracking, id, "applied").mark).toBe("applied");
      expect(warned).toEqual([{ module: "realness", postingId: id }]);
    });

    it("a record goes with its posting at clean-up", () => {
      const id = stale();
      setMark(tracking, id, "applied");
      t.db.run(sql`delete from collector_postings where id = ${id}`);
      expect(records()).toEqual([]);
    });
  });

  describe("noteListShown (flow 6)", () => {
    const list = () =>
      new Map([
        ["a", { penalty: 0, signals: [] }],
        ["b", { penalty: 15, signals: [{ kind: "no_salary" as const }] }],
        ["c", { penalty: 5, signals: [{ kind: "no_salary" as const }] }],
      ]);

    it("keeps the day's first share of lowered postings in the owner's list", () => {
      realness.noteListShown(list(), "own");
      clock = NOW + 60 * 60 * 1000;
      realness.noteListShown(new Map(), "off");
      expect(shares()).toEqual([{ day: "2026-10-16", postings: 3, lowered: 2, recorded_at: NOW }]);
    });

    it("ignores a one-off look; the next day gets its own share", () => {
      realness.noteListShown(list(), "look");
      expect(shares()).toEqual([]);
      clock = Date.UTC(2026, 9, 16, 22, 30); // 00:30 on the 17th in Warsaw
      realness.noteListShown(list(), "none");
      expect(shares()).toMatchObject([{ day: "2026-10-17" }]);
    });

    it("a share that cannot be written is logged with the day", () => {
      refuse("realness_daily_shares");
      expect(() => realness.noteListShown(list(), "own")).not.toThrow();
      expect(warned).toEqual([{ module: "realness", day: "2026-10-16" }]);
    });
  });
});
