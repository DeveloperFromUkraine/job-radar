// AC-03: newest first by effective time, ties by posting id (UUIDv7) descending. Pure.

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
