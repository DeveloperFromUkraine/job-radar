// A posting's mark state as the contract's MarkState (contracts/openapi.yaml): the row plus two
// computed fields — at risk (past the 60-day rule) and, for a cleared closed posting, the last day
// before clean-up removes it (the later of the grace day end and the retention date, AC-07).
import type { RetentionOutlook } from "../../collector/app/retention-outlook.js";
import { graceLastDay, nextDay, ownerDay } from "../domain/grace.js";
import type { MarkRow } from "../domain/mark.js";

const iso = (ms: number) => new Date(ms).toISOString();

export function presentMarkState(
  postingId: string,
  row: MarkRow | null,
  posting: { status: "open" | "closed" },
  outlook: RetentionOutlook | undefined,
  now: number,
  timeZone: string,
) {
  const clearedClosed = row !== null && row.mark === null && posting.status === "closed";
  return {
    posting_id: postingId,
    mark: row?.mark ?? null,
    marked_at: row ? iso(row.markedAt) : null,
    change_id: row?.changeId ?? null,
    at_risk: outlook?.pastRetention ?? false,
    removed_after: clearedClosed ? removedAfter(row, outlook, now, timeZone) : null,
  };
}

export type MarkState = ReturnType<typeof presentMarkState>;

function removedAfter(row: MarkRow, outlook: RetentionOutlook | undefined, now: number, timeZone: string) {
  // ponytail: clean-up may remove it on the day the counted age passes 60 days, so the last sure day
  // is the day before (never before today). It can stay one day longer than shown, never shorter.
  // Null while every source stays disabled: the age is frozen, so there is no removal date.
  if (!outlook || outlook.removableFrom === null) return null;
  const today = ownerDay(now, timeZone);
  const dayBefore = nextDay(ownerDay(outlook.removableFrom, timeZone), -1);
  const retention = dayBefore > today ? dayBefore : today;
  const grace = row.appliedLostAt === null ? null : graceLastDay(row.appliedLostAt, timeZone);
  return grace !== null && grace > retention ? grace : retention;
}
