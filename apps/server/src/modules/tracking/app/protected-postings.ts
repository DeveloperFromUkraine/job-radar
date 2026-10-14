// Tracking's implementation of the collector's ProtectedPostings port (ADR-0003, sad §6 Flow 6):
// applied postings, and postings within the grace day after losing applied, are kept by clean-up.
import type { ProtectedPostings } from "../../collector/app/marked-postings.js";
import { isProtected } from "../domain/grace.js";
import { rowsFor } from "../infra/repo.js";
import type { TrackingDeps } from "./deps.js";

export function protectedPostings(deps: TrackingDeps): ProtectedPostings {
  return {
    protectedAmong: async (postingIds) => {
      const now = deps.now();
      return new Set(
        rowsFor(deps.db, postingIds)
          .filter((row) => isProtected(row, now, deps.timeZone))
          .map((row) => row.postingId),
      );
    },
  };
}
