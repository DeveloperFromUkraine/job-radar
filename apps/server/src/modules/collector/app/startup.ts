// Start-up (sad §6 Flow 3): an interrupted run is recorded as incomplete, and every start is an app
// session — the overdue rule counts only time the app was running (AC-13).
import { newId } from "../../../core/id.js";
import { markRunningIncomplete } from "../infra/repo/runs.js";
import { ensureSources } from "../infra/repo/sources.js";
import { openSession, touchSession } from "../infra/repo/state.js";
import type { CollectorDeps } from "./deps.js";

export function startUp(deps: CollectorDeps): { sessionId: string } {
  ensureSources(deps.db);
  markRunningIncomplete(deps.db);
  const sessionId = newId();
  openSession(deps.db, sessionId, deps.now());
  return { sessionId };
}

export function heartbeat(deps: CollectorDeps, sessionId: string): void {
  touchSession(deps.db, sessionId, deps.now());
}
