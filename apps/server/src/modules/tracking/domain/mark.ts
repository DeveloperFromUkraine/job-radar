// The mark state machine (ADR-0003): set, change, clear, and undo guarded by the change id.
// Pure: the caller supplies the clock and the new change id.

export type Mark = "applied" | "skipped";

/** One tracking_marks row. `mark: null` = cleared; previous* null with a null date = never marked. */
export interface MarkRow {
  postingId: string;
  mark: Mark | null;
  markedAt: number;
  previousMark: Mark | null;
  previousMarkedAt: number | null;
  appliedLostAt: number | null;
  previousAppliedLostAt: number | null;
  changeId: string;
}

/**
 * The row after setting `mark` (null clears), or null when the posting already has that state —
 * nothing is written and the original date is kept (api-sync-report F-3). Losing applied starts the
 * grace day (AC-07); marking applied again ends it.
 */
export function applyMark(
  row: MarkRow | null,
  postingId: string,
  mark: Mark | null,
  now: number,
  changeId: string,
): MarkRow | null {
  if ((row?.mark ?? null) === mark) return null;
  const lostApplied = row?.mark === "applied";
  return {
    postingId,
    mark,
    markedAt: now,
    previousMark: row?.mark ?? null,
    previousMarkedAt: row?.markedAt ?? null,
    appliedLostAt: mark === "applied" ? null : lostApplied ? now : (row?.appliedLostAt ?? null),
    previousAppliedLostAt: row?.appliedLostAt ?? null,
    changeId,
  };
}

export type UndoOutcome =
  | { kind: "restore"; row: MarkRow }
  | { kind: "delete" } // undo of a first mark: the posting is unmarked again
  | { kind: "changedElsewhere" }; // AC-04: anything changed it since, even back to the same mark

export function applyUndo(row: MarkRow | null, changeId: string, newChangeId: string): UndoOutcome {
  if (!row || row.changeId !== changeId) return { kind: "changedElsewhere" };
  if (row.previousMarkedAt === null) return { kind: "delete" };
  return {
    kind: "restore",
    row: {
      postingId: row.postingId,
      mark: row.previousMark,
      markedAt: row.previousMarkedAt,
      previousMark: row.mark,
      previousMarkedAt: row.markedAt,
      appliedLostAt: row.previousAppliedLostAt,
      previousAppliedLostAt: row.appliedLostAt,
      changeId: newChangeId,
    },
  };
}
