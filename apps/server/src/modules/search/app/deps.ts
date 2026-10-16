import { machineTimeZone } from "../../../core/config.js";
import type { Db } from "../../../core/db.js";
import { type OpenPosting, openPostings, postingsByIds } from "../../collector/app/open-postings.js";
import { assess } from "../../realness/app/assess.js";
import { noteListShown } from "../../realness/app/records.js";
import { isOn } from "../../realness/app/settings.js";
import type { Realness } from "../../realness/domain/signals.js";
import { type ActiveFilter, activeFilter, type FilterMode } from "../../remote-filter/app/settings.js";
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

/** A posting's match as search shows it (match-score contract `Match`); computed by matching. */
export interface MatchView {
  state: "scored" | "pending" | "not_scored" | "cap_reached" | "could_not_score";
  total: number | null;
  parts: {
    skills: number | null;
    roleType: number | null;
    seniority: number | null;
    terms: number | null;
  } | null;
  note: string | null;
  claims: string[];
  stale: "posting_changed" | "profile_changed" | null;
  reason: string | null;
}

/**
 * Matching's answers search needs (match-score ADR-0004). Wired at the composition root, so search never
 * imports matching. A score only orders and informs: it never changes which postings are listed.
 */
export interface ScoreReader {
  hasProfile(): boolean;
  /** Each posting's match, from the postings' current text (staleness, ADR-0005). */
  matchesFor(postings: readonly OpenPosting[]): Map<string, MatchView>;
  /** A new list was read: the scorer looks at it now (match-score AC-13). */
  listRead(): void;
}

/** No matching wired in (or no profile): the list works exactly as before (match-score AC-15). */
export const NO_SCORES: ScoreReader = {
  hasProfile: () => false,
  matchesFor: () => new Map(),
  listRead: () => {},
};

/** Realness's answers search needs (realness-score ADR-0001): switch-on assessments and the switch. */
export interface RealnessReader {
  assess(postings: readonly OpenPosting[]): Map<string, Realness>;
  isOn(): boolean;
  noteListShown(assessments: ReadonlyMap<string, Realness>, filterMode: FilterMode): void;
}

export interface SearchLog {
  info(obj: object, msg: string): void;
  warn?(obj: object, msg: string): void;
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
  /** Default: no scores. app.ts wires matching's reader (match-score ADR-0004). */
  scores?: ScoreReader;
  /** Default: realness's app exports on `db`. Replaced in tests to simulate unreadable realness. */
  realness?: RealnessReader;
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
  const tracking = { db: deps.db, now: deps.now, timeZone: machineTimeZone() };
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

export function realnessOf(deps: SearchDeps): RealnessReader {
  if (deps.realness) return deps.realness;
  const realness = {
    db: deps.db,
    now: deps.now,
    timeZone: machineTimeZone(),
    log: deps.log?.warn ? { warn: (o: object) => deps.log?.warn?.(o, "realness not kept") } : undefined,
  };
  return {
    assess: (postings) => assess(realness, postings, deps.now()),
    isOn: () => isOn(realness),
    noteListShown: (assessments, filterMode) => noteListShown(realness, assessments, filterMode),
  };
}
