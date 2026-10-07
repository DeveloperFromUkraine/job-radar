// The tracking module (applied-skipped ADR-0001): the owner's applied / skipped marks, their rules,
// and the collector's ProtectedPostings port. app.ts creates it before the collector so the port can
// be handed over without the collector importing tracking.
import type { TrackingDeps } from "./app/deps.js";
import { protectedPostings } from "./app/protected-postings.js";

export type { TrackingDeps } from "./app/deps.js";

export function createTracking(deps: TrackingDeps) {
  return { deps, protectedPostings: protectedPostings(deps) };
}
