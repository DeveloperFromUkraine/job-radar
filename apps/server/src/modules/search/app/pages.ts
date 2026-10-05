// Flows 2 and 5: the next 50 postings of a snapshot, in snapshot order, with their current details.
// A posting closed since loading is left out (sad §11); later additions are never inserted (AC-16).
import { AppError } from "../../../core/errors.js";
import type { SearchDeps } from "./deps.js";
import { PAGE_SIZE, pageInfo, presentPosting } from "./present.js";
import { matchPostings, readCollection } from "./search.js";
import type { Snapshot, SnapshotStore } from "./snapshots.js";

export function knownSnapshot(snapshots: SnapshotStore, snapshotId: string): Snapshot {
  const snapshot = snapshots.get(snapshotId);
  if (!snapshot)
    throw new AppError(
      "SEARCH_SNAPSHOT_EXPIRED",
      "This list has expired; it was reloaded from the newest.",
      410,
    );
  return snapshot;
}

export function nextPage(deps: SearchDeps, snapshots: SnapshotStore, snapshotId: string, cursor: string) {
  const snapshot = knownSnapshot(snapshots, snapshotId);
  const offset = Number(cursor);
  const ids = snapshot.ids.slice(offset, offset + PAGE_SIZE);
  const current = new Map(
    matchPostings(
      snapshot.skills,
      readCollection((c) => c.byIds(ids), deps),
    ).map((f) => [f.posting.id, f]),
  );
  const items = ids.flatMap((id) => {
    const f = current.get(id);
    return f ? [presentPosting(f.posting, f.matched, snapshot.previousVisitStartedAt)] : [];
  });
  return { items, ...pageInfo(offset, snapshot.ids.length) };
}
