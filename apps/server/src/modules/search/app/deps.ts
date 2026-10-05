import type { Db } from "../../../core/db.js";
import { type OpenPosting, openPostings, postingsByIds } from "../../collector/app/open-postings.js";

/** The collector's open-postings export (ADR-0001), as search reads it. */
export interface Collection {
  open(opts?: { foundAfter?: number }): OpenPosting[];
  byIds(ids: readonly string[]): OpenPosting[];
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
