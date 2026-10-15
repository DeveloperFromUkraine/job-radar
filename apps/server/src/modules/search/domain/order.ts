// AC-03: newest first by effective time, ties by posting id (UUIDv7) descending; match-score AC-11:
// best match first. Pure.

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
 * Best match first (match-score AC-11): postings with no score first, in their newest-first order, so
 * fresh roles never sink; then scored ones from high to low, equal scores keeping newest first. `ids`
 * must already be newest first; `scoreOf` is null for a posting with no score.
 */
export function bestMatchOrder(ids: readonly string[], scoreOf: (id: string) => number | null): string[] {
  const unscored = ids.filter((id) => scoreOf(id) === null);
  const scored = ids.filter((id) => scoreOf(id) !== null);
  // Array.prototype.sort is stable, so equal scores stay newest first.
  scored.sort((a, b) => (scoreOf(b) as number) - (scoreOf(a) as number));
  return [...unscored, ...scored];
}
