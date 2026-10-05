// The search module (search-postings ADR-0001): skills search, feed, visits, paging and the waiting
// count over the collector's open postings. Snapshots live in this plugin's memory (ADR-0003).
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../../core/db.js";
import { createSnapshotStore } from "./app/snapshots.js";
import { searchRoutes } from "./ports/routes.js";

export interface SearchModuleOptions {
  db: Db;
  now?: () => number;
}

export function searchModule(options: SearchModuleOptions): FastifyPluginAsync {
  return async (app) => {
    const now = options.now ?? Date.now;
    const deps = { db: options.db, now, log: app.log.child({ module: "search" }) };
    await app.register(searchRoutes(deps, createSnapshotStore(now)));
  };
}
