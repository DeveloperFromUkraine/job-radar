// Flow 3: run a skills search (or the feed) and keep its ordered result as a snapshot.
import { AppError } from "../../../core/errors.js";
import type { OpenPosting } from "../../collector/app/open-postings.js";
import type { Realness } from "../../realness/domain/signals.js";
import type { LocationCheck } from "../../remote-filter/app/verdicts.js";
import { compileMatcher, type MatchedSkill } from "../domain/match.js";
import { bestMatchOrder, compareNewestFirst } from "../domain/order.js";
import { parseSkills } from "../domain/skills.js";
import { isNew } from "../domain/visit.js";
import { type ListOrder, readState, saveLastSkills, saveListOrder } from "../infra/repo.js";
import {
  type Collection,
  collectionOf,
  type LocationReader,
  locationOf,
  type MarkReader,
  type MatchView,
  marksOf,
  NO_SCORES,
  realnessOf,
  type SearchDeps,
} from "./deps.js";
import { presentMatch, presentPosting, walkUnmarked } from "./present.js";
import type { SnapshotStore } from "./snapshots.js";

export const COLLECTION_UNAVAILABLE = "Job-radar could not read its postings just now. Try again.";

/** Reads the collection, or answers 503 (AC-12). */
export function readCollection<T>(read: (c: Collection) => T, deps: SearchDeps): T {
  try {
    return read(collectionOf(deps));
  } catch {
    throw new AppError("SEARCH_COLLECTION_UNAVAILABLE", COLLECTION_UNAVAILABLE, 503);
  }
}

/** Reads marks, or answers 503: a list built without them could show decided postings (api-sync F-4). */
export function readMarks<T>(read: (m: MarkReader) => T, deps: SearchDeps): T {
  try {
    return read(marksOf(deps));
  } catch {
    throw new AppError("SEARCH_COLLECTION_UNAVAILABLE", COLLECTION_UNAVAILABLE, 503);
  }
}

/** Reads the location settings or verdicts, or answers 503: a list built without them could hide the wrong things. */
export function readLocation<T>(read: (l: LocationReader) => T, deps: SearchDeps): T {
  try {
    return read(locationOf(deps));
  } catch {
    throw new AppError("SEARCH_COLLECTION_UNAVAILABLE", COLLECTION_UNAVAILABLE, 503);
  }
}

/**
 * Each posting's match, read through matching's score reader (match-score ADR-0004). Fail-open: a score
 * only orders and never hides, so when scores cannot be read the list is built without them (api-sync
 * F-3) — unlike marks and location settings, which fail closed.
 */
export function readScores(
  deps: SearchDeps,
  postings: readonly OpenPosting[],
): { hasProfile: boolean; matches: Map<string, MatchView> | null } {
  const reader = deps.scores ?? NO_SCORES;
  let hasProfile = false;
  try {
    hasProfile = reader.hasProfile();
    if (!hasProfile) return { hasProfile, matches: null };
    return { hasProfile, matches: postings.length ? reader.matchesFor(postings) : new Map() };
  } catch (error) {
    // The owner keeps the "has a profile" state they have: the no-profile line would mislead them.
    deps.log?.warn?.({ module: "search", err: (error as Error).name }, "scores unreadable");
    return { hasProfile, matches: null };
  }
}

/**
 * The page's postings as the API's Posting, each with its look-alike hint (AC-10, AC-11), its "check
 * location" reason decided when the snapshot was built (remote-filter AC-02) and its match read fresh,
 * so a score that arrived after loading shows on its card (match-score AC-11 note).
 */
export function presentPage(
  deps: SearchDeps,
  page: readonly { posting: OpenPosting; matched: MatchedSkill[] }[],
  previousVisitStartedAt: number | null,
  checks: ReadonlyMap<string, LocationCheck> = new Map(),
  known?: Map<string, MatchView> | null,
  realness: ReadonlyMap<string, Realness> = new Map(),
) {
  const hints = readMarks((m) => m.hintsFor(page.map((f) => f.posting)), deps);
  const matches =
    known !== undefined
      ? known
      : readScores(
          deps,
          page.map((f) => f.posting),
        ).matches;
  return page.map((f) => ({
    ...presentPosting(f.posting, f.matched, previousVisitStartedAt, hints.get(f.posting.id) ?? null),
    location_check: checks.get(f.posting.id) ?? null,
    match: presentMatch(matches?.get(f.posting.id)),
    realness: presentRealness(realness.get(f.posting.id)),
  }));
}

const presentRealness = (r: Realness | undefined) => (r && r.signals.length > 0 ? r : null);

/**
 * Realness for the shown postings, with switch-on rules, and the switch (realness-score ADR-0002). Fail-open
 * like scores: realness only orders and informs, so when it cannot be read the list is built without it.
 */
export function readRealness(
  deps: SearchDeps,
  postings: readonly OpenPosting[],
): { assessments: Map<string, Realness>; on: boolean; read: boolean } {
  const reader = realnessOf(deps);
  // The switch is read on its own, so a facts failure never shows a saved "off" as on (review F-04).
  let on = true;
  try {
    on = reader.isOn();
  } catch (error) {
    deps.log?.warn?.({ module: "search", err: (error as Error).name }, "realness switch unreadable");
  }
  try {
    return { assessments: reader.assess(postings), on, read: true };
  } catch (error) {
    deps.log?.warn?.({ module: "search", err: (error as Error).name }, "realness unreadable");
    return { assessments: new Map(), on, read: false };
  }
}

/**
 * The skills each posting matches, on its open listings only. Unmatched postings are dropped unless
 * `keepUnmatched` (the feed, or a next page of a snapshot that already chose its postings).
 */
export function matchPostings(
  skills: string[],
  postings: OpenPosting[],
  keepUnmatched = skills.length === 0,
  everyListing = false, // the marked view: a closed posting has no open listing (api-sync-report F-1)
) {
  const matcher = compileMatcher(skills);
  const result: { posting: OpenPosting; matched: MatchedSkill[] }[] = [];
  for (const posting of postings) {
    const texts = posting.listings
      .filter((l) => everyListing || l.status === "open")
      .map((l) => ({ title: l.title ?? "", description: l.description ?? "" }));
    const matched = matcher.match(texts);
    if (keepUnmatched || matched.length > 0) result.push({ posting, matched });
  }
  return result;
}

/**
 * The owner's list as search builds it: open postings matching `skills`, newest first, with the location
 * verdicts of the visit's filter and the marks. `runSearch` keeps marked ones in its snapshot; the owner's
 * list (`ownerList`) leaves them out. One definition, so matching scores exactly what is listed (ADR-0004).
 */
export function selectList(
  deps: SearchDeps,
  skills: string[],
  visitStartedAt: number | null,
  loadedAt: number,
) {
  // The filter of this visit: the owner's own, a one-off look, off, or none (remote-filter AC-04 – AC-07).
  const filter = readLocation((l) => l.activeFilter(visitStartedAt ?? 0), deps);
  const filterCountry =
    filter.mode === "own" || filter.mode === "look" ? (filter.country?.code ?? null) : null;

  const open = readCollection((c) => c.open(), deps);
  const found = matchPostings(skills, open).sort((a, b) => compareNewestFirst(a.posting, b.posting));
  // Verdicts for every match, marked ones too, before the snapshot (remote-filter ADR-0002).
  const verdicts = filterCountry
    ? readLocation(
        (l) =>
          l.verdictsFor(
            found.map((f) => f.posting),
            filterCountry,
            new Date(loadedAt),
          ),
        deps,
      )
    : new Map();
  const hidden = (id: string) => verdicts.get(id)?.kind === "not_open";
  const checks = new Map<string, LocationCheck>();
  for (const [id, v] of verdicts) if (v.kind === "check") checks.set(id, v.reason);
  const marked = readMarks((m) => m.markedIds(), deps);
  return { filter, filterCountry, open, found, hidden, checks, marked };
}

export function runSearch(
  deps: SearchDeps,
  snapshots: SnapshotStore,
  skillsText: string,
  chosenOrder?: ListOrder,
) {
  const started = performance.now();
  const parsed = parseSkills(skillsText);
  if (!parsed.ok) throw new AppError("SEARCH_INVALID_SKILLS", parsed.message);
  const { skills } = parsed;
  saveLastSkills(deps.db, skills); // before the read: a failed read still remembers them (flow 3)
  if (chosenOrder) saveListOrder(deps.db, chosenOrder); // kept for the next opening (match-score AC-11)
  const { previousVisitStartedAt, visitStartedAt, listOrder } = readState(deps.db);
  const loadedAt = deps.now();
  const { filter, filterCountry, open, found, hidden, checks, marked } = selectList(
    deps,
    skills,
    visitStartedAt,
    loadedAt,
  );
  // The snapshot keeps marked matches, so a posting cleared later returns in its place (ADR-0002).
  const shown = found.filter((f) => !hidden(f.posting.id));
  const unmarked = shown.filter((f) => !marked.has(f.posting.id));
  const markedCount = found.filter((f) => marked.has(f.posting.id)).length;
  const hiddenCount = found.filter((f) => hidden(f.posting.id) && !marked.has(f.posting.id)).length;
  const newCount = unmarked.filter((f) => isNew(f.posting.firstFoundAt, previousVisitStartedAt)).length;

  // The order is fixed with the snapshot (search AC-16). Best match first needs every shown posting's
  // score; newest first only the page's, read below (match-score AC-11, sad.md §6 flow 2).
  const wanted: ListOrder = listOrder ?? "newest";
  const scores =
    wanted === "best_match"
      ? readScores(
          deps,
          shown.map((f) => f.posting),
        )
      : readScores(deps, []);
  // Best match first is kept with no profile or unreadable scores: every posting is then unscored (ADR-0003).
  const order: ListOrder = wanted;
  const realnessStarted = performance.now();
  const {
    assessments,
    on: realnessOn,
    read: realnessRead,
  } = readRealness(
    deps,
    shown.map((f) => f.posting),
  );
  const realnessMs = Math.round(performance.now() - realnessStarted);
  // The day's share counts the owner's list: shown and unmarked, switch-on values (AC-14). An unread list
  // keeps no share: a 0-of-0 row would hold the day's slot (review F-03).
  try {
    if (realnessRead)
      realnessOf(deps).noteListShown(
        new Map(
          unmarked.flatMap((f) => {
            const r = assessments.get(f.posting.id);
            return r ? [[f.posting.id, r] as const] : [];
          }),
        ),
        filter.mode,
      );
  } catch {
    // best-effort: never costs the owner the list
  }
  const kept = realnessOn ? assessments : new Map<string, Realness>();
  const newestIds = shown.map((f) => f.posting.id);
  const ids =
    order === "best_match"
      ? bestMatchOrder(
          newestIds,
          (id) => {
            const m = scores.matches?.get(id);
            return m?.state === "scored" ? m.total : null;
          },
          (id) => kept.get(id)?.penalty ?? 0,
        )
      : newestIds;

  const snapshot = snapshots.create({
    skills,
    loadedAt,
    previousVisitStartedAt,
    ids,
    newCount,
    filterCountry,
    hiddenCount,
    checks,
    realness: kept,
  });
  const { picked, ...page } = walkUnmarked(snapshot.ids, 0, marked);
  const byId = new Map(found.map((f) => [f.posting.id, f]));
  const pagePostings = picked.map((id) => byId.get(id) as (typeof found)[number]);
  const pageMatches =
    order === "best_match"
      ? scores.matches
      : readScores(
          deps,
          pagePostings.map((f) => f.posting),
        ).matches;
  if (scores.hasProfile) {
    try {
      (deps.scores ?? NO_SCORES).listRead(); // wake the scorer (match-score AC-13)
    } catch {
      // a scorer that cannot be woken never costs the owner the list
    }
  }

  deps.log?.info(
    {
      durationMs: Math.round(performance.now() - started),
      openPostings: open.length,
      matched: found.length,
      skillCount: skills.length,
      country: filterCountry,
      hidden: hiddenCount,
      checked: unmarked.filter((f) => checks.has(f.posting.id)).length,
      lowered: [...kept.values()].filter((r) => r.penalty > 0).length,
      realnessMs,
    },
    "search",
  );
  return {
    snapshot_id: snapshot.id,
    skills,
    order,
    has_profile: scores.hasProfile,
    realness_on: realnessOn,
    total: unmarked.length,
    new_count: newCount,
    marked_count: markedCount,
    hidden_count: hiddenCount,
    collection_empty: open.length === 0,
    location_filter: filter,
    items: presentPage(deps, pagePostings, previousVisitStartedAt, checks, pageMatches, kept),
    ...page,
  };
}
