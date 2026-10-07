// Retention (AC-10): unmarked postings more than 60 counted days past closing (closed) or past the
// last offer from an enabled source (open) are removed; days when all of a posting's sources were
// disabled do not count (AC-26). Clean-up runs once per calendar day in the owner's time zone.

export const RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

export interface Period {
  from: number;
  until: number | null; // null = still disabled
}

export interface RetentionPosting {
  status: "open" | "closed";
  closedAt: number | null;
  lastOfferedAt: number;
}

/** Time since the clock started, minus the stretches when every one of the posting's sources was disabled. */
export function countedAgeMs(
  posting: RetentionPosting,
  disabledPeriodsPerSource: readonly (readonly Period[])[],
  now: number,
): number {
  const start =
    posting.status === "closed" && posting.closedAt !== null ? posting.closedAt : posting.lastOfferedAt;
  if (now <= start) return 0;

  const bounds = new Set<number>([start, now]);
  for (const periods of disabledPeriodsPerSource) {
    for (const p of periods) {
      for (const t of [p.from, p.until ?? now]) if (t > start && t < now) bounds.add(t);
    }
  }
  const points = [...bounds].sort((a, b) => a - b);
  const allDisabledAt = (t: number) =>
    disabledPeriodsPerSource.length > 0 &&
    disabledPeriodsPerSource.every((periods) =>
      periods.some((p) => p.from <= t && t < (p.until ?? Infinity)),
    );

  let paused = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i] as number, points[i + 1] as number];
    if (allDisabledAt((a + b) / 2)) paused += b - a;
  }
  return now - start - paused;
}

export function isPastRetention(countedAge: number): boolean {
  return countedAge > RETENTION_MS;
}

/** The owner's calendar day (YYYY-MM-DD) to clean up for, or null when that day was already done. */
export function cleanupDay(
  lastCleanupOn: string | null,
  runFinishedAt: number,
  timeZone: string,
): string | null {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(runFinishedAt);
  return day === lastCleanupOn ? null : day;
}
