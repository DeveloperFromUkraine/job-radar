// Flow 2 poll: matching postings first collected after the snapshot loaded (AC-16). Also the visit
// heartbeat, so a visible tab keeps one visit going (AC-14).
import type { SearchDeps } from "./deps.js";
import { knownSnapshot } from "./pages.js";
import { matchPostings, readCollection } from "./search.js";
import type { SnapshotStore } from "./snapshots.js";
import { touchVisit } from "./visits.js";

export function waitingCount(deps: SearchDeps, snapshots: SnapshotStore, snapshotId: string) {
  touchVisit(deps); // first: a poll on an expired snapshot (410) still keeps the visit going
  const snapshot = knownSnapshot(snapshots, snapshotId);
  const added = readCollection((c) => c.open({ foundAfter: snapshot.loadedAt }), deps);
  return { waiting_count: matchPostings(snapshot.skills, added).length };
}
