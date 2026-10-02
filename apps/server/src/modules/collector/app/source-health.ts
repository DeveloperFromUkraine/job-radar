// Source health and the problem marker (sad §6 Flow 10, AC-12, AC-13). Reads only — nothing here
// changes collection state; overdue is computed now from the app's running time.
import { overdueReason, raisesMarker, type Session } from "../domain/health.js";
import { nextDueAt } from "../domain/schedule.js";
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type Settings,
  type SourceState,
  sourceState,
} from "../domain/settings.js";
import { SOURCES, type SourceDefinition, type SourceId } from "../domain/sources.js";
import {
  anyRunFinished,
  freshnessRows,
  lastOutcome,
  latestEndedRun,
  readsSince,
  runOutcomes,
} from "../infra/repo/health.js";
import { type RunRow, type RunSourceRow, readRun, runningRun } from "../infra/repo/runs.js";
import { readFlags, readSources, type SourceRow } from "../infra/repo/sources.js";
import { readSessions, readState } from "../infra/repo/state.js";
import type { CollectorDeps } from "./deps.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const registryIndex = (id: string) => SOURCES.findIndex((s) => s.id === id);
const iso = (t: number | null | undefined) => (t == null ? null : new Date(t).toISOString());

/** The settings in force: the last valid copy (a GET never touches the settings file). */
function settingsInForce(deps: CollectorDeps): Settings {
  const copy = readState(deps.db).lastValidSettings;
  const parsed = copy ? parseSettings(copy) : null;
  return parsed?.ok ? parsed.settings : DEFAULT_SETTINGS;
}

function overdueFor(
  source: SourceDefinition,
  row: SourceRow,
  state: SourceState,
  sessions: Session[],
  now: number,
) {
  if (state !== "enabled" || row.lastReadAt === null) return null;
  return overdueReason(row.lastReadAt, source.intervalMs, sessions, now);
}

export function getProblems(deps: CollectorDeps) {
  const now = deps.now();
  const settings = settingsInForce(deps);
  const sessions = readSessions(deps.db);
  const rows = readSources(deps.db);
  const problems: { source_id: SourceId | null; kind: string }[] = [];
  for (const source of SOURCES) {
    const row = rows.find((r) => r.id === source.id);
    if (!row) continue;
    for (const flag of readFlags(deps.db, source.id)) {
      if (raisesMarker(flag.kind)) problems.push({ source_id: source.id, kind: flag.kind });
    }
    if (overdueFor(source, row, sourceState(settings, source), sessions, now)) {
      problems.push({ source_id: source.id, kind: "overdue" });
    }
  }
  if (readState(deps.db).settingsProblem) problems.push({ source_id: null, kind: "settings_unreadable" });
  return { has_problem: problems.length > 0, problems };
}

function outcomeJson(row: RunSourceRow) {
  return {
    source_id: row.sourceId,
    outcome: row.outcome,
    failure_reason: row.failureReason,
    counts: {
      added: row.added,
      updated: row.updated,
      closed: row.closed,
      held: row.held,
      no_category: row.noCategory,
    },
    fetch_finished_at: iso(row.fetchFinishedAt),
  };
}

function runJson(deps: CollectorDeps, run: RunRow | null) {
  if (!run) return null;
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    started_at: iso(run.startedAt),
    finished_at: iso(run.finishedAt),
    sources: runOutcomes(deps.db, run.id)
      .sort((a, b) => registryIndex(a.sourceId) - registryIndex(b.sourceId))
      .map(outcomeJson),
  };
}

/** p90 by nearest rank, in whole minutes; null for an empty sample. */
function p90Minutes(deltas: number[]): number | null {
  if (deltas.length === 0) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const value = sorted[Math.ceil(0.9 * sorted.length) - 1] as number;
  return Math.round(value / MIN);
}

export function getSourceHealth(deps: CollectorDeps) {
  const { db } = deps;
  const now = deps.now();
  const settings = settingsInForce(deps);
  const sessions = readSessions(db);
  const state = readState(db);
  const current = runningRun(db);
  const readingNow = new Set(
    current
      ? runOutcomes(db, current.id)
          .filter((o) => o.outcome === "pending")
          .map((o) => o.sourceId)
      : [],
  );
  const rows = readSources(db);
  const inSession = (t: number) => sessions.some((s) => t >= s.startedAt && t <= s.lastSeenAt);

  const sources = SOURCES.map((source) => {
    const row = rows.find((r) => r.id === source.id) as SourceRow;
    const sourceStateNow = sourceState(settings, source);
    const overdue = overdueFor(source, row, sourceStateNow, sessions, now);
    const fresh = freshnessRows(db, source.id, now - 30 * DAY);
    const sample = fresh
      .filter((f): f is { publishedAt: number; firstCollectedAt: number } => f.publishedAt !== null)
      .filter((f) => inSession(f.publishedAt))
      .map((f) => f.firstCollectedAt - f.publishedAt);
    const last = lastOutcome(db, source.id);
    return {
      source_id: source.id,
      state: sourceStateNow,
      last_success_at: iso(row.lastSuccessAt),
      next_due_at:
        sourceStateNow !== "enabled" || readingNow.has(source.id)
          ? null
          : iso(nextDueAt(source, row.lastReadAt, now)),
      last_outcome: last ? outcomeJson(last) : null,
      flags: [
        ...readFlags(db, source.id).map((f) => ({
          kind: f.kind,
          reason: f.reason,
          raised_at: iso(f.raisedAt),
          raises_marker: raisesMarker(f.kind),
        })),
        ...(overdue ? [{ kind: "overdue", reason: overdue, raised_at: null, raises_marker: true }] : []),
      ],
      fill: {
        status: row.fillStatus,
        reached_at: iso(row.fillReachedAt),
        next_part_due_at: iso(row.fillNextPartDueAt),
        completed_at: iso(row.fillCompletedAt),
      },
      reads: {
        last_60_min: readsSince(db, source.id, now - HOUR),
        last_24_h: readsSince(db, source.id, now - DAY),
      },
      freshness: {
        p90_minutes: p90Minutes(sample),
        sample_size: sample.length,
        without_publication_time: fresh.filter((f) => f.publishedAt === null).length,
      },
    };
  });

  return {
    any_run_finished: anyRunFinished(db),
    settings: {
      notice: state.settingsNotice,
      problem: state.settingsProblem,
      problem_since: iso(state.settingsProblemAt),
    },
    current_run: runJson(deps, current),
    last_run: runJson(deps, latestEndedRun(db)),
    sources,
  };
}

export function runJsonById(deps: CollectorDeps, runId: string) {
  return runJson(deps, readRun(deps.db, runId));
}
