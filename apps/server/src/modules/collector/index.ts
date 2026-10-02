// The collector module (ADR-0001): routes + the in-process scheduler, started with the server and
// stopped on close. Owner marks come from the MarkedPostings port (ADR-0006).
import type { FastifyPluginAsync } from "fastify";
import { type DbHandle, openDb } from "../../core/db.js";
import type { CollectorDeps } from "./app/deps.js";
import { type MarkedPostings, noMarks } from "./app/marked-postings.js";
import { executeRun } from "./app/run-pipeline.js";
import { createScheduler, type StartedRun } from "./app/scheduler.js";
import { startUp } from "./app/startup.js";
import { settingsPathFor } from "./infra/settings.js";
import { createAdapters } from "./infra/sources/index.js";
import { collectorRoutes } from "./ports/routes.js";

export interface CollectorModuleOptions {
  databaseFile: string;
  /** Points every source at a fake server (tests). */
  sourcesBaseUrl?: string;
  /** false: no scheduled or catch-up runs (tests drive runs through collect-now). */
  scheduler?: boolean;
  marks?: MarkedPostings;
  now?: () => number;
}

export function collectorModule(options: CollectorModuleOptions): FastifyPluginAsync {
  return async (app) => {
    const handle: DbHandle = openDb(options.databaseFile);
    const deps: CollectorDeps = {
      db: handle.db,
      now: options.now ?? Date.now,
      settingsFile: settingsPathFor(options.databaseFile),
      adapters: createAdapters({ baseUrl: options.sourcesBaseUrl }),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const marks = options.marks ?? noMarks;
    const log = app.log.child({ module: "collector" });
    const running = new Set<Promise<void>>();
    const execute = (run: StartedRun) => {
      const p = executeRun(deps, run, marks, log).catch((err) =>
        log.error({ err, runId: run.runId }, "run failed"),
      );
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
      await scheduler.stop();
      await Promise.allSettled([...running]);
      handle.close();
    });
  };
}
