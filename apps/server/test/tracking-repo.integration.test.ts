import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newId } from "../src/core/id.js";
import { applyMark, type MarkRow } from "../src/modules/tracking/domain/mark.js";
import {
  deleteGuarded,
  getMark,
  markedIds,
  markRowsNewestFirst,
  PostingGone,
  replaceGuarded,
  rowsFor,
  writeMark,
} from "../src/modules/tracking/infra/repo.js";
import { addPosting } from "./helpers/search-fixtures.js";
import { createTempDb, type TempDb } from "./helpers/temp-db.js";
import { seedMarks } from "./helpers/tracking-fixtures.js";

describe("tracking repo", () => {
  let t: TempDb;
  let p: string;
  beforeEach(() => {
    t = createTempDb();
    p = addPosting(t.db);
  });
  afterEach(() => t.cleanup());

  const first = (id: string, mark: "applied" | "skipped", at = 10) =>
    applyMark(null, id, mark, at, newId()) as MarkRow;

  it("writes a new row and reads it back", () => {
    const row = first(p, "applied");
    writeMark(t.db, row);
    expect(getMark(t.db, p)).toEqual(row);
    expect(getMark(t.db, "nope")).toBeNull();
  });

  it("replaces the row on a later change", () => {
    const row = first(p, "applied");
    writeMark(t.db, row);
    const next = applyMark(row, p, "skipped", 20, newId()) as MarkRow;
    writeMark(t.db, next);
    expect(getMark(t.db, p)).toEqual(next);
  });

  it("raises PostingGone for a posting that no longer exists (AC-15)", () => {
    expect(() => writeMark(t.db, first(newId(), "skipped"))).toThrow(PostingGone);
  });

  it("applies a guarded replace only while the change id is current (AC-03, AC-04)", () => {
    const row = first(p, "applied");
    writeMark(t.db, row);
    const restored = { ...row, mark: "skipped" as const, changeId: newId() };
    expect(replaceGuarded(t.db, restored, "stale")).toBe(false);
    expect(getMark(t.db, p)).toEqual(row);
    expect(replaceGuarded(t.db, restored, row.changeId)).toBe(true);
    expect(getMark(t.db, p)).toEqual(restored);
  });

  it("deletes a first mark only while the change id is current", () => {
    const row = first(p, "applied");
    writeMark(t.db, row);
    expect(deleteGuarded(t.db, p, "stale")).toBe(false);
    expect(deleteGuarded(t.db, p, row.changeId)).toBe(true);
    expect(getMark(t.db, p)).toBeNull();
  });

  it("lists currently marked ids, leaving cleared rows out", () => {
    const [a, b, c] = [addPosting(t.db), addPosting(t.db), addPosting(t.db)];
    seedMarks(t.db, [a], { mark: "applied" });
    seedMarks(t.db, [b], { mark: "skipped" });
    seedMarks(t.db, [c], { mark: null });
    expect(markedIds(t.db)).toEqual(new Set([a, b]));
  });

  it("lists every row newest first, ties by posting id (marked view order)", () => {
    const [a, b, c] = [addPosting(t.db), addPosting(t.db), addPosting(t.db)];
    seedMarks(t.db, [a], { mark: "applied", markedAt: 5 });
    seedMarks(t.db, [b], { mark: null, markedAt: 9 });
    seedMarks(t.db, [c], { mark: "skipped", markedAt: 5 });
    expect(markRowsNewestFirst(t.db).map((r) => r.postingId)).toEqual([b, ...[a, c].sort()]);
  });

  it("reads the rows of given ids, in chunks", () => {
    const ids = Array.from({ length: 1200 }, () => addPosting(t.db));
    seedMarks(t.db, ids, { mark: "applied" });
    expect(rowsFor(t.db, [...ids, "missing"]).length).toBe(1200);
  });
});
