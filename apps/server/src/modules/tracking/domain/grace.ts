// The grace day (AC-07) and protection from clean-up (AC-09). Days are the owner's calendar days in
// the time zone clean-up already uses (collector deps.timeZone), compared as YYYY-MM-DD strings.
import type { MarkRow } from "./mark.js";

export function ownerDay(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** The calendar day `by` days after `day` (YYYY-MM-DD); plain date arithmetic, no time zone involved. */
export function nextDay(day: string, by = 1): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
}

/** The last day a posting that lost applied at `appliedLostAt` is still protected. */
export function graceLastDay(appliedLostAt: number, timeZone: string): string {
  return nextDay(ownerDay(appliedLostAt, timeZone));
}

/** Applied, or within the grace day after losing applied. Skipped and cleared otherwise are not. */
export function isProtected(row: MarkRow, now: number, timeZone: string): boolean {
  if (row.mark === "applied") return true;
  return row.appliedLostAt !== null && ownerDay(now, timeZone) <= graceLastDay(row.appliedLostAt, timeZone);
}
