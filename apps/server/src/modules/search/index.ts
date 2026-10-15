// The search module (search-postings ADR-0001): skills search, feed, visits, paging and the waiting
// count over the collector's open postings. Snapshots live in this plugin's memory (ADR-0003).
import type { FastifyPluginAsync } from "fastify";
import type { Db } from "../../core/db.js";
import type { ScoreReader } from "./app/deps.js";
import { createSnapshotStore } from "./app/snapshots.js";
import { searchRoutes } from "./ports/routes.js";

export interface SearchModuleOptions {
  db: Db;
  now?: () => number;
  /** Matching's reader, wired in app.ts (match-score ADR-0004); default: no scores. */
  scores?: ScoreReader;
}

export function searchModule(options: SearchModuleOptions): FastifyPluginAsync {
  return async (app) => {
    const now = options.now ?? Date.now;
    const deps = { db: options.db, now, scores: options.scores, log: app.log.child({ module: "search" }) };
    await app.register(searchRoutes(deps, createSnapshotStore(now)));
  };
}
