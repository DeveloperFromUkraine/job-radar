// The in-process scheduler (ADR-0003): a due-check right after start (catch-up, AC-18), then every
// minute. Each check refreshes the app session's heartbeat; an opened run is handed to `executeRun`.
import type { CollectorDeps } from "./deps.js";
import { type OpenRunResult, openRun } from "./open-run.js";
import { heartbeat, startUp } from "./startup.js";

export type StartedRun = Extract<OpenRunResult, { kind: "started" }>;

export interface SchedulerOptions {
  executeRun: (run: StartedRun) => Promise<void>;
  intervalMs?: number;
  onError?: (err: unknown) => void;
}

export interface Scheduler {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createScheduler(deps: CollectorDeps, options: SchedulerOptions): Scheduler {
  let timer: NodeJS.Timeout | undefined;
  let sessionId = "";
  let busy: Promise<void> | null = null;

  const tick = (trigger: "catch_up" | "schedule") => {
    // The app is running even while a long run is busy: overdue counts that time (AC-13).
    heartbeat(deps, sessionId);
    if (busy) return busy; // a run is still executing; the unique index guards the rest
    busy = (async () => {
      try {
        const result = openRun(deps, trigger);
        if (result.kind === "started") await options.executeRun(result);
      } catch (err) {
        options.onError?.(err);
      } finally {
        busy = null;
      }
    })();
    return busy;
  };

  return {
    async start() {
      sessionId = startUp(deps).sessionId;
      // The catch-up run executes in the background: the server answers at once (≤ 5 s, spec §6).
      void tick("catch_up");
      timer = setInterval(() => void tick("schedule"), options.intervalMs ?? 60_000);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await busy;
    },
  };
}
