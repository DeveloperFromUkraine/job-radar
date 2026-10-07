import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAccessGuard } from "./core/access.js";
import { openDb } from "./core/db.js";
import { registerErrorHandling } from "./core/errors.js";
import { type CollectorModuleOptions, collectorModule } from "./modules/collector/index.js";
import { healthModule } from "./modules/health/index.js";
import { searchModule } from "./modules/search/index.js";

export interface BuildAppOptions {
  logger?: boolean;
  // The configured port; the Host check uses the real listening port once the server listens.
  port?: number;
  /** The collector and search modules on one database; left out by tests that need no database. */
  collector?: Omit<CollectorModuleOptions, "handle">;
  /** The built web app (apps/web/dist): served with client-side routes falling back to index.html. */
  webDist?: string;
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
    await app.register(collectorModule({ ...options.collector, handle }));
    await app.register(searchModule({ db: handle.db, now: options.collector.now }));
  }
  if (spa) await app.register(fastifyStatic, { root: spa, wildcard: false });

  return app;
}
