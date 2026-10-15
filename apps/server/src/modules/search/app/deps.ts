import type { Db } from "../../../core/db.js";
import { type OpenPosting, openPostings, postingsByIds } from "../../collector/app/open-postings.js";
import { type ActiveFilter, activeFilter } from "../../remote-filter/app/settings.js";
import { type Verdict, verdictsFor } from "../../remote-filter/app/verdicts.js";
import type { MarkState } from "../../tracking/app/mark-state.js";
import {
  hintsFor,
  type LookAlike,
  markedIds,
  markedOrder,
  markStatesFor,
} from "../../tracking/app/queries.js";

/** The collector's open-postings export (ADR-0001), as search reads it. */
export interface Collection {
  open(opts?: { foundAfter?: number }): OpenPosting[];
  byIds(ids: readonly string[]): OpenPosting[];
  /** Open or closed (applied-skipped marked view). */
  byIdsWithClosed(ids: readonly string[]): OpenPosting[];
}

/** Tracking's answers search needs on every page (applied-skipped ADR-0002, ADR-0004). */
export interface MarkReader {
  markedIds(): ReadonlySet<string>;
  hintsFor(postings: readonly { id: string; company: string; title: string }[]): Map<string, LookAlike>;
  markedOrder(): string[];
  markStatesFor(postings: readonly { id: string; status: "open" | "closed" }[]): Map<string, MarkState>;
}

/** Remote-filter's answers search needs (remote-filter ADR-0002): the visit's filter and the verdicts. */
export interface LocationReader {
  activeFilter(visitStartedAt: number): ActiveFilter;
  verdictsFor(postings: readonly OpenPosting[], country: string, date: Date): Map<string, Verdict>;
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
  /** Default: remote-filter's app exports on `db`. Replaced in tests to simulate unreadable settings. */
  location?: LocationReader;
  log?: SearchLog;
}

export function collectionOf(deps: SearchDeps): Collection {
  return (
    deps.collection ?? {
      open: (opts) => openPostings(deps.db, opts),
      byIds: (ids) => postingsByIds(deps.db, ids),
      byIdsWithClosed: (ids) => postingsByIds(deps.db, ids, { includeClosed: true }),
    }
  );
}

export function marksOf(deps: SearchDeps): MarkReader {
  if (deps.marks) return deps.marks;
  // The machine's zone: the one clean-up and tracking's grace day use (removed_after dates).
  const tracking = { db: deps.db, now: deps.now, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  return {
    markedIds: () => markedIds(tracking),
    hintsFor: (postings) => hintsFor(tracking, postings),
    markedOrder: () => markedOrder(tracking),
    markStatesFor: (postings) => markStatesFor(tracking, postings),
  };
}

export function locationOf(deps: SearchDeps): LocationReader {
  if (deps.location) return deps.location;
  const remoteFilter = { db: deps.db, now: deps.now };
  return {
    activeFilter: (visitStartedAt) => activeFilter(remoteFilter, visitStartedAt),
    verdictsFor: (postings, country, date) => verdictsFor(remoteFilter, postings, country, date),
  };
}
