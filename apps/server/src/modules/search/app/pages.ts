// Flows 2 and 5: the next 50 unmarked postings of a snapshot, in snapshot order, with their current
// details; marks are checked as each page loads (applied-skipped ADR-0002, AC-12).
// A posting closed since loading is left out (sad §11); a still-open one stays even if its text no
// longer matches, with its current matches; later additions are never inserted (AC-16).
import { AppError } from "../../../core/errors.js";
import type { SearchDeps } from "./deps.js";
import { walkUnmarked } from "./present.js";
import { matchPostings, presentPage, readCollection, readMarks } from "./search.js";
import type { Snapshot, SnapshotStore } from "./snapshots.js";

export function knownSnapshot(snapshots: SnapshotStore, snapshotId: string, marked = false): Snapshot {
  const snapshot = snapshots.get(snapshotId);
  if (!snapshot || Boolean(snapshot.marked) !== marked)
    throw new AppError(
      "SEARCH_SNAPSHOT_EXPIRED",
      "This list has expired; it was reloaded from the newest.",
      410,
    );
  return snapshot;
}

export function nextPage(deps: SearchDeps, snapshots: SnapshotStore, snapshotId: string, cursor: string) {
  const snapshot = knownSnapshot(snapshots, snapshotId);
  const marked = readMarks((m) => m.markedIds(), deps);
  const { picked, ...page } = walkUnmarked(snapshot.ids, Number(cursor), marked);
  const current = new Map(
    matchPostings(
      snapshot.skills,
      readCollection((c) => c.byIds(picked), deps),
      true,
    ).map((f) => [f.posting.id, f]),
  );
  const found = picked.flatMap((id) => {
    const f = current.get(id);
    return f ? [f] : [];
  });
  return { items: presentPage(deps, found, snapshot.previousVisitStartedAt, snapshot.checks), ...page };
}
