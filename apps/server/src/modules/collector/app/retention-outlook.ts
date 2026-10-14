// Read-only retention outlook for other modules (applied-skipped AC-07): per posting, whether it is
// past the 60-day rule and from when clean-up may remove it. Same rule as dailyCleanup, never re-derived.
import type { Db } from "../../../core/db.js";
import { countedAgeMs, isPastRetention, periodsPerSource, RETENTION_MS } from "../domain/retention.js";
import { retentionInputsByIds } from "../infra/repo/postings.js";
import { readDisabledPeriods } from "../infra/repo/sources.js";

export interface RetentionOutlook {
  pastRetention: boolean;
  /** When the counted age first passes 60 days; null while every source stays disabled (age frozen). */
  removableFrom: number | null;
}

export function retentionOutlook(
  db: Db,
  postingIds: readonly string[],
  now: number,
): Map<string, RetentionOutlook> {
  const periods = readDisabledPeriods(db);
  const outlook = new Map<string, RetentionOutlook>();
  for (const p of retentionInputsByIds(db, postingIds)) {
    const perSource = periodsPerSource(p.sourceIds, periods);
    const age = countedAgeMs(p, perSource, now);
    const frozen =
      perSource.length > 0 && perSource.every((ps) => ps.some((d) => d.from <= now && d.until === null));
    outlook.set(p.id, {
      pastRetention: isPastRetention(age),
      removableFrom: frozen && !isPastRetention(age) ? null : now + (RETENTION_MS - age) + 1,
    });
  }
  return outlook;
}
