// Flow 3: run a skills search (or the feed) and keep its ordered result as a snapshot.
import { AppError } from "../../../core/errors.js";
import type { OpenPosting } from "../../collector/app/open-postings.js";
import { compileMatcher, type MatchedSkill } from "../domain/match.js";
import { compareNewestFirst } from "../domain/order.js";
import { parseSkills } from "../domain/skills.js";
import { isNew } from "../domain/visit.js";
import { readState, saveLastSkills } from "../infra/repo.js";
import { type Collection, collectionOf, type MarkReader, marksOf, type SearchDeps } from "./deps.js";
import { presentPosting, walkUnmarked } from "./present.js";
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

/** The page's postings as the API's Posting, each with its look-alike hint (AC-10, AC-11). */
export function presentPage(
  deps: SearchDeps,
  page: readonly { posting: OpenPosting; matched: MatchedSkill[] }[],
  previousVisitStartedAt: number | null,
) {
  const hints = readMarks((m) => m.hintsFor(page.map((f) => f.posting)), deps);
  return page.map((f) =>
    presentPosting(f.posting, f.matched, previousVisitStartedAt, hints.get(f.posting.id) ?? null),
  );
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

export function runSearch(deps: SearchDeps, snapshots: SnapshotStore, skillsText: string) {
  const started = performance.now();
  const parsed = parseSkills(skillsText);
  if (!parsed.ok) throw new AppError("SEARCH_INVALID_SKILLS", parsed.message);
  const { skills } = parsed;
  saveLastSkills(deps.db, skills); // before the read: a failed read still remembers them (flow 3)
  const { previousVisitStartedAt } = readState(deps.db);

  const loadedAt = deps.now();
  const open = readCollection((c) => c.open(), deps);
  const found = matchPostings(skills, open).sort((a, b) => compareNewestFirst(a.posting, b.posting));
  // The snapshot keeps marked matches, so a posting cleared later returns in its place (ADR-0002).
  const marked = readMarks((m) => m.markedIds(), deps);
  const unmarked = found.filter((f) => !marked.has(f.posting.id));
  const newCount = unmarked.filter((f) => isNew(f.posting.firstFoundAt, previousVisitStartedAt)).length;
  const snapshot = snapshots.create({
    skills,
    loadedAt,
    previousVisitStartedAt,
    ids: found.map((f) => f.posting.id),
    newCount,
  });
  const { picked, ...page } = walkUnmarked(snapshot.ids, 0, marked);
  const byId = new Map(found.map((f) => [f.posting.id, f]));

  deps.log?.info(
    {
      durationMs: Math.round(performance.now() - started),
      openPostings: open.length,
      matched: found.length,
      skillCount: skills.length,
    },
    "search",
  );
  return {
    snapshot_id: snapshot.id,
    skills,
    total: unmarked.length,
    new_count: newCount,
    marked_count: found.length - unmarked.length,
    collection_empty: open.length === 0,
    items: presentPage(
      deps,
      picked.map((id) => byId.get(id) as (typeof found)[number]),
      previousVisitStartedAt,
    ),
    ...page,
  };
}
