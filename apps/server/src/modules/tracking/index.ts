// The tracking module (applied-skipped ADR-0001): the owner's applied / skipped marks, their rules,
// and the collector's ProtectedPostings port. app.ts creates it before the collector so the port can
// be handed over without the collector importing tracking.
import type { FastifyPluginAsync } from "fastify";
import type { TrackingDeps } from "./app/deps.js";
import { protectedPostings } from "./app/protected-postings.js";
import { trackingRoutes } from "./ports/routes.js";

export type { TrackingDeps } from "./app/deps.js";

export function createTracking(deps: TrackingDeps) {
  const plugin: FastifyPluginAsync = async (app) => {
    await app.register(trackingRoutes({ ...deps, log: app.log.child({ module: "tracking" }) }));
  };
  return { deps, protectedPostings: protectedPostings(deps), plugin };
}
