// Run start (sad §6 Flow 4): settings first, then one due-check — the same rule for scheduled,
// catch-up and collect-now runs (ADR-0003). A source is read only once its interval has passed and
// its window allows; at most one run is in progress.
import { newId } from "../../../core/id.js";
import { isDue, nextDueAt, windowAllows } from "../domain/schedule.js";
import { type Settings, type SourceState, sourceState } from "../domain/settings.js";
import { SOURCES, type SourceId } from "../domain/sources.js";
import { insertRun, type RunTrigger, runningRun } from "../infra/repo/runs.js";
import { readSource, readTimesSince, syncDisabledPeriod } from "../infra/repo/sources.js";
import { loadSettings } from "../infra/settings.js";
import type { CollectorDeps } from "./deps.js";

const DAY = 24 * 60 * 60 * 1000;

export interface NextDue {
  sourceId: SourceId;
  state: SourceState;
  /** null when the source is read in this run, disabled or not verified. */
  nextDueAt: number | null;
}

export type OpenRunResult =
  | {
      kind: "started";
      runId: string;
      trigger: RunTrigger;
      due: SourceId[];
      nextDue: NextDue[];
      settings: Settings;
    }
  | { kind: "already_running" }
  | { kind: "nothing_due"; nextDue: NextDue[] };

export function openRun(deps: CollectorDeps, trigger: RunTrigger): OpenRunResult {
  const { db } = deps;
  if (runningRun(db)) return { kind: "already_running" };

  const now = deps.now();
  const { settings } = loadSettings(db, deps.settingsFile, now);
  const due: SourceId[] = [];
  const nextDue: NextDue[] = [];
  for (const source of SOURCES) {
    const state = sourceState(settings, source);
    syncDisabledPeriod(db, source.id, state === "disabled", now);
    const { lastReadAt } = readSource(db, source.id);
    const readNow =
      state === "enabled" &&
      isDue(source, lastReadAt, now) &&
      windowAllows(source, readTimesSince(db, source.id, now - DAY), now);
    if (readNow) due.push(source.id);
    nextDue.push({
      sourceId: source.id,
      state,
      nextDueAt: state !== "enabled" || readNow ? null : nextDueAt(source, lastReadAt, now),
    });
  }

  if (due.length === 0) return { kind: "nothing_due", nextDue };
  const runId = newId();
  if (!insertRun(db, { id: runId, trigger, startedAt: now, due })) return { kind: "already_running" };
  return { kind: "started", runId, trigger, due, nextDue, settings };
}
