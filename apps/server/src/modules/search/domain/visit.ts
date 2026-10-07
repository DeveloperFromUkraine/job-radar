// AC-14: visits and new marks. Pure; `now` is injected.

export const VISIT_GAP_MS = 30 * 60_000;

export interface VisitState {
  visitStartedAt: number | null;
  visitLastSeenAt: number | null;
  previousVisitStartedAt: number | null;
}

/** Opening the main screen: more than 30 min since last seen (or never) starts a new visit. */
export function nextVisit(state: VisitState, now: number): VisitState {
  if (state.visitLastSeenAt !== null && now - state.visitLastSeenAt <= VISIT_GAP_MS)
    return { ...state, visitLastSeenAt: now };
  return { visitStartedAt: now, visitLastSeenAt: now, previousVisitStartedAt: state.visitStartedAt };
}

/** New = first collected strictly after the previous visit's start; nothing is new on the first visit. */
export function isNew(firstFoundAt: number, previousVisitStartedAt: number | null): boolean {
  return previousVisitStartedAt !== null && firstFoundAt > previousVisitStartedAt;
}
