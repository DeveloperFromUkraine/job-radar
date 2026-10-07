import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TrackingDeps } from "../src/modules/tracking/app/deps.js";
import { setMark } from "../src/modules/tracking/app/marks.js";
import { hintsFor, markedIds, markedOrder, markStatesFor } from "../src/modules/tracking/app/queries.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

const NOW = Date.UTC(2026, 9, 7, 9, 15);
const OCT3 = Date.UTC(2026, 9, 3, 14, 0);

describe("tracking queries for search", () => {
  let t: TempDb;
  let deps: TrackingDeps;
  beforeEach(() => {
    t = createTempDb();
    deps = { db: t.db, now: () => NOW, timeZone: "Europe/Kyiv" };
  });
  afterEach(() => t.cleanup());

  it("lists the currently marked ids (AC-12)", () => {
    const [a, b] = [addPosting(t.db), addPosting(t.db)];
    setMark(deps, a, "applied");
    setMark(deps, b, "skipped");
    setMark(deps, b, null);
    expect(markedIds(deps)).toEqual(new Set([a]));
  });

  describe("markedOrder (AC-05)", () => {
    it("orders marked and cleared-closed postings newest first, leaving cleared open ones out", () => {
      const applied = addPosting(t.db);
      const closedSkip = addPosting(t.db, { status: "closed", listings: [{ status: "closed" }] });
      const clearedClosed = addPosting(t.db, { status: "closed", listings: [{ status: "closed" }] });
      const clearedOpen = addPosting(t.db);
      seedMarks(t.db, [applied], { mark: "applied", markedAt: 1 });
      seedMarks(t.db, [closedSkip], { mark: "skipped", markedAt: 3 });
      seedMarks(t.db, [clearedClosed], { mark: null, markedAt: 2 });
      seedMarks(t.db, [clearedOpen], { mark: null, markedAt: 4 });

      expect(markedOrder(deps)).toEqual([closedSkip, clearedClosed, applied]);
    });
  });

  it("gives fresh mark states for postings, closed ones included", () => {
    const p = addPosting(t.db, { status: "closed", listings: [{ status: "closed" }] });
    setMark(deps, p, "applied");
    expect(markStatesFor(deps, [{ id: p, status: "closed" }]).get(p)).toMatchObject({
      posting_id: p,
      mark: "applied",
      at_risk: true, // the fixture's offer time is decades old
    });
  });

  describe("hintsFor (AC-10, AC-11)", () => {
    function marked(company: string, title: string, mark: "applied" | "skipped", at: number, closed = false) {
      const id = addPosting(t.db, {
        company,
        title,
        status: closed ? "closed" : "open",
        listings: [{ status: closed ? "closed" : "open" }],
      });
      seedMarks(t.db, [id], { mark, markedAt: at });
      return id;
    }

    it("hints the AC-10 re-post with the applied mark and its date", () => {
      marked("Acme Inc", "Sr. Backend Engineer (Go) – Remote", "applied", OCT3, true);
      const repost = { id: "new", company: "ACME", title: "Senior Backend Engineer" };
      expect(hintsFor(deps, [repost]).get("new")).toEqual({
        mark: "applied",
        marked_at: "2026-10-03T14:00:00.000Z",
        company: "Acme Inc",
      });
    });

    it("names an applied match over a newer skip", () => {
      marked("Acme", "Backend Engineer", "skipped", OCT3 + 5);
      marked("Acme", "Backend Engineer", "applied", OCT3);
      expect(hintsFor(deps, [{ id: "x", company: "Acme", title: "Backend Engineer" }]).get("x")?.mark).toBe(
        "applied",
      );
    });

    it("gives no hint for the same company with a different title, nor for a cleared match", () => {
      marked("Acme", "Backend Engineer", "applied", OCT3);
      const cleared = addPosting(t.db, { company: "Globex", title: "Data Engineer" });
      seedMarks(t.db, [cleared], { mark: null });
      const hints = hintsFor(deps, [
        { id: "x", company: "Acme", title: "Frontend Engineer" },
        { id: "y", company: "Globex", title: "Data Engineer" },
      ]);
      expect(hints.size).toBe(0);
    });

    it("never hints a posting about itself", () => {
      const id = marked("Acme", "Backend Engineer", "applied", OCT3);
      expect(hintsFor(deps, [{ id, company: "Acme", title: "Backend Engineer" }]).size).toBe(0);
    });

    it("costs nothing when nothing is marked", () => {
      t.db.run(sql`delete from tracking_marks`);
      expect(hintsFor(deps, [{ id: "x", company: "Acme", title: "Backend Engineer" }]).size).toBe(0);
    });
  });
});
