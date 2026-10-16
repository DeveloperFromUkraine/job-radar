import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAccessGuard } from "./core/access.js";
import { loadMatchingConfig, machineTimeZone } from "./core/config.js";
import { openDb } from "./core/db.js";
import { registerErrorHandling } from "./core/errors.js";
import { type CollectorModuleOptions, collectorModule } from "./modules/collector/index.js";
import { healthModule } from "./modules/health/index.js";
import { createMatching } from "./modules/matching/index.js";
import type { Provider } from "./modules/matching/infra/claude.js";
import { createRealness } from "./modules/realness/index.js";
import { createRemoteFilter } from "./modules/remote-filter/index.js";
import { ownerList } from "./modules/search/app/owner-list.js";
import { searchModule } from "./modules/search/index.js";
import { createTracking } from "./modules/tracking/index.js";

export interface BuildAppOptions {
  logger?: boolean;
  // The configured port; the Host check uses the real listening port once the server listens.
  port?: number;
  /** The collector and search modules on one database; left out by tests that need no database. */
  collector?: Omit<CollectorModuleOptions, "handle">;
  /** The built web app (apps/web/dist): served with client-side routes falling back to index.html. */
  webDist?: string;
  /** Match scoring: the stand-in provider and no background scorer in tests; env defaults to process.env. */
  matching?: { provider?: Provider; scorer?: boolean; env?: NodeJS.ProcessEnv };
}

// Composition root: every module is a Fastify plugin registered here.
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const spa =
    options.webDist && existsSync(join(options.webDist, "index.html")) ? options.webDist : undefined;
  registerErrorHandling(app, { spaFallback: Boolean(spa) });
  registerAccessGuard(app, options.port ?? 3000);

  await app.register(healthModule);
  if (options.collector) {
    // One SQLite connection for every module (search sad §8): no SQLITE_BUSY between them. A root
    // onClose hook added before the plugins runs after theirs, so the collector's in-flight run
    // finishes on an open handle.
    const handle = openDb(options.collector.databaseFile);
    app.addHook("onClose", async () => handle.close());
    // Realness before tracking: tracking reports mark changes to it (realness-score ADR-0001).
    const realness = createRealness({
      db: handle.db,
      now: options.collector.now ?? Date.now,
      timeZone: machineTimeZone(),
      log: app.log.child({ module: "realness" }),
    });
    // Tracking next: the collector's clean-up asks its ProtectedPostings port what to keep.
    const tracking = createTracking({
      db: handle.db,
      now: options.collector.now ?? Date.now,
      timeZone: machineTimeZone(),
      onMarkChanged: realness.onMarkChanged,
    });
    await app.register(
      collectorModule({ ...options.collector, handle, protectedPostings: tracking.protectedPostings }),
    );
    await app.register(tracking.plugin);
    const remoteFilter = createRemoteFilter({ db: handle.db, now: options.collector.now ?? Date.now });
    await app.register(remoteFilter.plugin);
    await app.register(realness.plugin);
    // Matching scores search's owner list and search reads matching's scores (match-score ADR-0004):
    // both are wired here, so neither module imports the other.
    const now = options.collector.now ?? Date.now;
    const matching = createMatching({
      db: handle.db,
      now,
      timeZone: machineTimeZone(),
      config: loadMatchingConfig(options.matching?.env ?? process.env),
      ownerList: () => ownerList({ db: handle.db, now }),
      provider: options.matching?.provider,
      scorer: options.matching?.scorer ?? options.collector.scheduler !== false,
    });
    await app.register(matching.plugin);
    await app.register(
      searchModule({ db: handle.db, now: options.collector.now, scores: matching.scoreReader }),
    );
  }
  if (spa) await app.register(fastifyStatic, { root: spa, wildcard: false });

  return app;
}
