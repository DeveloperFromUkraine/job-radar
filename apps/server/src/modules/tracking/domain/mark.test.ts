import { describe, expect, it } from "vitest";
import { applyMark, applyUndo, type MarkRow } from "./mark.js";

const P = "posting-1";
const T1 = Date.UTC(2026, 9, 3, 14, 0);
const T2 = Date.UTC(2026, 9, 7, 9, 15);

function row(over: Partial<MarkRow> = {}): MarkRow {
  return {
    postingId: P,
    mark: "applied",
    markedAt: T1,
    previousMark: null,
    previousMarkedAt: null,
    appliedLostAt: null,
    previousAppliedLostAt: null,
    changeId: "c1",
    ...over,
  };
}

describe("applyMark", () => {
  it("creates a first mark with no previous state", () => {
    expect(applyMark(null, P, "skipped", T2, "c2")).toEqual(
      row({ mark: "skipped", markedAt: T2, changeId: "c2" }),
    );
  });

  it("moves the current state into the previous state on a change (AC-06)", () => {
    expect(applyMark(row(), P, "skipped", T2, "c2")).toEqual({
      postingId: P,
      mark: "skipped",
      markedAt: T2,
      previousMark: "applied",
      previousMarkedAt: T1,
      appliedLostAt: T2, // applied was lost (AC-07)
      previousAppliedLostAt: null,
      changeId: "c2",
    });
  });

  it("records when applied was lost on a clear, and keeps the row (AC-07)", () => {
    const next = applyMark(row(), P, null, T2, "c2");
    expect(next).toMatchObject({ mark: null, markedAt: T2, appliedLostAt: T2, previousMark: "applied" });
  });

  it("ends the grace day when the posting is marked applied again", () => {
    const lost = row({ mark: null, markedAt: T2, appliedLostAt: T2, changeId: "c2" });
    expect(applyMark(lost, P, "applied", T2 + 1000, "c3")).toMatchObject({
      mark: "applied",
      appliedLostAt: null,
      previousAppliedLostAt: T2,
    });
  });

  it("keeps an earlier applied-lost time through later changes that do not involve applied", () => {
    const skipped = row({ mark: "skipped", markedAt: T2, appliedLostAt: T2, changeId: "c2" });
    expect(applyMark(skipped, P, null, T2 + 1000, "c3")?.appliedLostAt).toBe(T2);
  });

  it("writes nothing when the posting already has that state (api-sync-report F-3)", () => {
    expect(applyMark(row(), P, "applied", T2, "c2")).toBeNull();
    expect(applyMark(null, P, null, T2, "c2")).toBeNull();
    expect(applyMark(row({ mark: null }), P, null, T2, "c2")).toBeNull();
  });
});

describe("applyUndo", () => {
  it("restores the previous mark with its original date (AC-03)", () => {
    const changed = applyMark(row(), P, "skipped", T2, "c2") as MarkRow;
    const undone = applyUndo(changed, "c2", "c3");
    expect(undone).toEqual({
      kind: "restore",
      row: {
        postingId: P,
        mark: "applied",
        markedAt: T1,
        previousMark: "skipped",
        previousMarkedAt: T2,
        appliedLostAt: null,
        previousAppliedLostAt: T2,
        changeId: "c3",
      },
    });
  });

  it("restores a cleared state with its date", () => {
    const cleared = row({ mark: null, markedAt: T1, appliedLostAt: T1 });
    const marked = applyMark(cleared, P, "applied", T2, "c2") as MarkRow;
    expect(applyUndo(marked, "c2", "c3")).toMatchObject({
      kind: "restore",
      row: { mark: null, markedAt: T1, appliedLostAt: T1 },
    });
  });

  it("deletes the row when undoing a first mark (back to never marked)", () => {
    const first = applyMark(null, P, "applied", T2, "c2") as MarkRow;
    expect(applyUndo(first, "c2", "c3")).toEqual({ kind: "delete" });
  });

  it("refuses when the change id is no longer current, even back to the same mark (AC-04)", () => {
    const first = applyMark(null, P, "applied", T2, "c2") as MarkRow;
    const away = applyMark(first, P, "skipped", T2 + 1, "c3") as MarkRow;
    const back = applyMark(away, P, "applied", T2 + 2, "c4") as MarkRow;
    expect(applyUndo(back, "c2", "c5")).toEqual({ kind: "changedElsewhere" });
  });

  it("refuses when there is no row any more", () => {
    expect(applyUndo(null, "c2", "c3")).toEqual({ kind: "changedElsewhere" });
  });
});
