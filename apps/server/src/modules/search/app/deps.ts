import type { Db } from "../../../core/db.js";
import { type OpenPosting, openPostings, postingsByIds } from "../../collector/app/open-postings.js";
import { hintsFor, type LookAlike, markedIds } from "../../tracking/app/queries.js";

/** The collector's open-postings export (ADR-0001), as search reads it. */
export interface Collection {
  open(opts?: { foundAfter?: number }): OpenPosting[];
  byIds(ids: readonly string[]): OpenPosting[];
}

/** Tracking's answers search needs on every page (applied-skipped ADR-0002, ADR-0004). */
export interface MarkReader {
  markedIds(): ReadonlySet<string>;
  hintsFor(postings: readonly { id: string; company: string; title: string }[]): Map<string, LookAlike>;
}

export interface SearchLog {
  info(obj: object, msg: string): void;
}

/** What search's use cases need; the clock is injected so every rule is testable. */
export interface SearchDeps {
  db: Db;
  now: () => number;
  /** Default: the collector export on `db`. Replaced in tests to simulate an unreadable collection. */
  collection?: Collection;
  /** Default: tracking's queries on `db`. Replaced in tests to simulate marks that cannot be read. */
  marks?: MarkReader;
  log?: SearchLog;
}

export function collectionOf(deps: SearchDeps): Collection {
  return (
    deps.collection ?? {
      open: (opts) => openPostings(deps.db, opts),
      byIds: (ids) => postingsByIds(deps.db, ids),
    }
  );
}

export function marksOf(deps: SearchDeps): MarkReader {
  if (deps.marks) return deps.marks;
  // Neither query depends on the time zone; tracking's deps want one, so pass the machine's.
  const tracking = { db: deps.db, now: deps.now, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  return {
    markedIds: () => markedIds(tracking),
    hintsFor: (postings) => hintsFor(tracking, postings),
  };
}
