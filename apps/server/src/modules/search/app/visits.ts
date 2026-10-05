// Flow 1 (open the main screen) and the flow 2 heartbeat. The visit rule is domain/visit.ts.
import { nextVisit } from "../domain/visit.js";
import { readState, saveVisit } from "../infra/repo.js";
import type { SearchDeps } from "./deps.js";

export interface OpenedVisit {
  lastSkills: string[];
  previousVisitStartedAt: number | null;
}

export function openVisit(deps: SearchDeps): OpenedVisit {
  const { lastSkills, ...state } = readState(deps.db);
  const visit = nextVisit(state, deps.now());
  saveVisit(deps.db, visit);
  return { lastSkills, previousVisitStartedAt: visit.previousVisitStartedAt };
}

/** Waiting-count poll: refreshes "last seen" only, never starts a visit. */
export function touchVisit(deps: SearchDeps): void {
  const { lastSkills: _, ...state } = readState(deps.db);
  saveVisit(deps.db, { ...state, visitLastSeenAt: deps.now() });
}
