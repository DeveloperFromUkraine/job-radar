// The collector module (ADR-0001): routes + the in-process scheduler, started with the server and
// stopped on close. Clean-up asks the ProtectedPostings port what to keep (ADR-0006).
import { dirname, join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { machineTimeZone } from "../../core/config.js";
import type { DbHandle } from "../../core/db.js";
import type { CollectorDeps } from "./app/deps.js";
import { noMarks, type ProtectedPostings } from "./app/marked-postings.js";
import { executeRun } from "./app/run-pipeline.js";
import { createScheduler, type StartedRun } from "./app/scheduler.js";
import { startUp } from "./app/startup.js";
import { CollectorStopping } from "./infra/http.js";
import { settingsPathFor } from "./infra/settings.js";
import { createAdapters } from "./infra/sources/index.js";
import { collectorRoutes } from "./ports/routes.js";

export interface CollectorModuleOptions {
  databaseFile: string;
  /** The app's one SQLite handle (opened and closed by app.ts, shared with search). */
  handle: DbHandle;
  /** Points every source at a fake server (tests). */
  sourcesBaseUrl?: string;
  /** false: no scheduled or catch-up runs (tests drive runs through collect-now). */
  scheduler?: boolean;
  /** Which postings clean-up must keep (tracking's port, wired in app.ts). */
  protectedPostings?: ProtectedPostings;
  now?: () => number;
}

export function collectorModule(options: CollectorModuleOptions): FastifyPluginAsync {
  return async (app) => {
    const { handle } = options;
    const stopping = new AbortController();
    const deps: CollectorDeps = {
      db: handle.db,
      now: options.now ?? Date.now,
      settingsFile: settingsPathFor(options.databaseFile),
      adapters: createAdapters({
        baseUrl: options.sourcesBaseUrl,
        importsDir: join(dirname(options.databaseFile), "imports"),
      }),
      timeZone: machineTimeZone(),
      signal: stopping.signal,
    };
    const marks = options.protectedPostings ?? noMarks;
    const log = app.log.child({ module: "collector" });
    const running = new Set<Promise<void>>();
    const execute = (run: StartedRun) => {
      const p = executeRun(deps, run, marks, log).catch((err) => {
        // A run cut short by shutdown is expected, not a failure (review R7).
        if (err instanceof CollectorStopping) log.info({ runId: run.runId }, "run interrupted by shutdown");
        else log.error({ err, runId: run.runId }, "run failed");
      });
      running.add(p);
      void p.finally(() => running.delete(p));
      return p;
    };

    const scheduler = createScheduler(deps, {
      executeRun: execute,
      onError: (err) => log.error({ err }, "due-check failed"),
    });
    await app.register(collectorRoutes(deps, (run) => void execute(run)));

    if (options.scheduler === false) startUp(deps);
    else app.addHook("onReady", async () => scheduler.start());
    app.addHook("onClose", async () => {
      stopping.abort(); // in-flight reads end now; the run is left incomplete (AC-20)
      await scheduler.stop();
      await Promise.allSettled([...running]);
    });
  };
}
