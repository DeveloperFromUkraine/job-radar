// Typed client for the collector API (docs/features/remote-boards-collector/contracts/openapi.yaml).
export type SourceId = "jobicy" | "himalayas" | "remotive" | "weworkremotely";
export type SourceState = "enabled" | "disabled" | "not_verified";
export type FlagKind =
  | "failing"
  | "silent"
  | "overdue"
  | "held_back"
  | "unknown_location"
  | "category_unmatched";

export interface ProblemSummary {
  has_problem: boolean;
  problems: { source_id: SourceId | null; kind: FlagKind | "settings_unreadable" }[];
}

export interface RunCounts {
  added: number;
  updated: number;
  closed: number;
  held: number;
  no_category: number;
}

export interface RunSourceOutcome {
  source_id: SourceId;
  outcome: "pending" | "complete" | "capped" | "partial" | "failed";
  failure_reason: string | null;
  counts: RunCounts;
  fetch_finished_at: string | null;
}

export interface Run {
  id: string;
  trigger: "schedule" | "catch_up" | "collect_now";
  status: "running" | "finished" | "incomplete";
  started_at: string;
  finished_at: string | null;
  sources: RunSourceOutcome[];
}

export interface SourceFlag {
  kind: FlagKind;
  reason: string;
  raised_at: string | null;
  raises_marker: boolean;
}

export interface SourceHealthRow {
  source_id: SourceId;
  state: SourceState;
  last_success_at: string | null;
  next_due_at: string | null;
  last_outcome: RunSourceOutcome | null;
  flags: SourceFlag[];
  fill: {
    status: "pending" | "continuing" | "limited" | "complete";
    reached_at: string | null;
    next_part_due_at: string | null;
    completed_at: string | null;
  };
  reads: { last_60_min: number; last_24_h: number };
  freshness: { p90_minutes: number | null; sample_size: number; without_publication_time: number };
}

export interface SourceHealth {
  any_run_finished: boolean;
  settings: {
    notice: "defaults_in_use" | null;
    problem: string | null;
    problem_since: string | null;
    running_on: "last_valid" | "defaults" | null;
  };
  current_run: Run | null;
  last_run: Run | null;
  sources: SourceHealthRow[];
}

export interface NextDue {
  source_id: SourceId;
  state: SourceState;
  next_due_at: string | null;
}

export interface CollectNowResult {
  started: boolean;
  run: Run | null;
  next_due: NextDue[];
}

/** An error response, carrying the envelope's code and plain-language message. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("NETWORK", "The app could not be reached.", 0);
  }
  const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    throw new ApiError(
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? `Request failed (${res.status}).`,
      res.status,
    );
  }
  return body as T;
}

export const getProblems = () => request<ProblemSummary>("/api/v1/collector/problems");
export const getSourceHealth = () => request<SourceHealth>("/api/v1/collector/source-health");
export const collectNow = () =>
  request<CollectNowResult>("/api/v1/collector/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

export const SOURCE_NAMES: Record<SourceId, { name: string; url: string }> = {
  jobicy: { name: "Jobicy", url: "https://jobicy.com" },
  himalayas: { name: "Himalayas", url: "https://himalayas.app" },
  remotive: { name: "Remotive", url: "https://remotive.com" },
  weworkremotely: { name: "We Work Remotely", url: "https://weworkremotely.com" },
};
