// Flow 2 poll: unmarked matching postings first collected after the snapshot loaded (AC-16;
// applied-skipped AC-12), counting only what the snapshot's own filter would show (remote-filter AC-09).
// Also the visit
// heartbeat, so a visible tab keeps one visit going (AC-14).
import type { SearchDeps } from "./deps.js";
import { knownSnapshot } from "./pages.js";
import { matchPostings, readCollection, readLocation, readMarks } from "./search.js";
import type { SnapshotStore } from "./snapshots.js";
import { touchVisit } from "./visits.js";

export function waitingCount(deps: SearchDeps, snapshots: SnapshotStore, snapshotId: string) {
  touchVisit(deps); // first: a poll on an expired snapshot (410) still keeps the visit going
  const snapshot = knownSnapshot(snapshots, snapshotId);
  const added = readCollection((c) => c.open({ foundAfter: snapshot.loadedAt }), deps);
  const marked = readMarks((m) => m.markedIds(), deps);
  const matched = matchPostings(snapshot.skills, added).filter((f) => !marked.has(f.posting.id));
  const country = snapshot.filterCountry;
  if (!country) return { waiting_count: matched.length };
  const verdicts = readLocation(
    (l) =>
      l.verdictsFor(
        matched.map((f) => f.posting),
        country,
        new Date(deps.now()),
      ),
    deps,
  );
  return { waiting_count: matched.filter((f) => verdicts.get(f.posting.id)?.kind !== "not_open").length };
}
