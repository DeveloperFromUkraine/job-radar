// The marked view (applied-skipped AC-05, sad §6 Flow 3): marked postings, open or closed, plus closed
// postings whose mark was cleared, most recently changed first. Order and pages are fixed in a
// snapshot when the view loads; each page reads the postings and their mark states fresh.
import { AppError } from "../../../core/errors.js";
import type { OpenPosting } from "../../collector/app/open-postings.js";
import type { MatchedSkill } from "../domain/match.js";
import { parseSkills } from "../domain/skills.js";
import type { SearchDeps } from "./deps.js";
import { knownSnapshot } from "./pages.js";
import { presentPosting, walkUnmarked } from "./present.js";
import { matchPostings, readCollection, readMarks } from "./search.js";
import type { SnapshotStore } from "./snapshots.js";

const NONE = new Set<string>();

function presentMarked(
  deps: SearchDeps,
  found: readonly { posting: OpenPosting; matched: MatchedSkill[] }[],
) {
  const states = readMarks((m) => m.markStatesFor(found.map((f) => f.posting)), deps);
  return found.map(({ posting, matched }) => {
    const { is_new: _, look_alike: __, ...rest } = presentPosting(posting, matched, null);
    return {
      ...rest,
      status: posting.status,
      mark_state: states.get(posting.id) as NonNullable<ReturnType<typeof states.get>>,
    };
  });
}

function readPage(deps: SearchDeps, skills: string[], ids: readonly string[]) {
  const current = new Map(
    matchPostings(
      skills,
      readCollection((c) => c.byIdsWithClosed(ids), deps),
      true,
      true,
    ).map((f) => [f.posting.id, f]),
  );
  return ids.flatMap((id) => {
    const f = current.get(id);
    return f ? [f] : []; // removed by clean-up since loading
  });
}

/** Opens the marked view. The skills narrow it as in runSearch but are not saved (api-sync-report F-7). */
export function runMarkedView(deps: SearchDeps, snapshots: SnapshotStore, skillsText: string) {
  const parsed = parseSkills(skillsText);
  if (!parsed.ok) throw new AppError("SEARCH_INVALID_SKILLS", parsed.message);
  const { skills } = parsed;

  const order = readMarks((m) => m.markedOrder(), deps);
  const postings = readCollection((c) => c.byIdsWithClosed(order), deps);
  const kept = new Set(matchPostings(skills, postings, skills.length === 0, true).map((f) => f.posting.id));
  const ids = order.filter((id) => kept.has(id));
  const marked = readMarks((m) => m.markedIds(), deps);
  const cleared = ids.filter((id) => !marked.has(id)).length; // in the view but unmarked = cleared closed

  const snapshot = snapshots.create({
    skills,
    loadedAt: deps.now(),
    previousVisitStartedAt: null,
    ids,
    newCount: 0,
    marked: true,
  });
  const { picked, ...page } = walkUnmarked(ids, 0, NONE);
  return {
    snapshot_id: snapshot.id,
    skills,
    marked_count: ids.length - cleared,
    cleared_count: cleared,
    items: presentMarked(deps, readPage(deps, skills, picked)),
    ...page,
  };
}

/** The next 50 of a marked snapshot in its fixed order, with fresh mark states (AC-05). */
export function nextMarkedPage(
  deps: SearchDeps,
  snapshots: SnapshotStore,
  snapshotId: string,
  cursor: string,
) {
  const snapshot = knownSnapshot(snapshots, snapshotId, true);
  const { picked, ...page } = walkUnmarked(snapshot.ids, Number(cursor), NONE);
  return { items: presentMarked(deps, readPage(deps, snapshot.skills, picked)), ...page };
}
