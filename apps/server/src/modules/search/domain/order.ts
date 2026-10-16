// AC-03: newest first by effective time, ties by posting id (UUIDv7) descending; match-score AC-11:
// best match first with the realness penalty (realness-score). Pure.

export interface Timed {
  publishedAt: number | null;
  firstFoundAt: number;
}

/** Publication time capped at first collection; no publication time → first collection. */
export function effectiveTime({ publishedAt, firstFoundAt }: Timed): number {
  return publishedAt === null ? firstFoundAt : Math.min(publishedAt, firstFoundAt);
}

export function compareNewestFirst(a: Timed & { id: string }, b: Timed & { id: string }): number {
  return effectiveTime(b) - effectiveTime(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/**
 * Best match first (match-score AC-11, amended by realness-score ADR-0003): postings with no score first,
 * so fresh roles never sink — those with no realness penalty newest first, then the rest from the smallest
 * penalty to the largest; then scored ones from the highest to the lowest score minus the penalty. Equal
 * values keep newest first. `ids` must already be newest first; `scoreOf` is null for a posting with no
 * score; `penaltyOf` is 0 with realness off.
 */
export function bestMatchOrder(
  ids: readonly string[],
  scoreOf: (id: string) => number | null,
  penaltyOf: (id: string) => number = () => 0,
): string[] {
  const unscored = ids.filter((id) => scoreOf(id) === null);
  const scored = ids.filter((id) => scoreOf(id) !== null);
  // Array.prototype.sort is stable, so equal values stay newest first.
  unscored.sort((a, b) => penaltyOf(a) - penaltyOf(b));
  scored.sort((a, b) => (scoreOf(b) as number) - penaltyOf(b) - ((scoreOf(a) as number) - penaltyOf(a)));
  return [...unscored, ...scored];
}
