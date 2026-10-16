// The realness module (ADR-0001): the switch, the penalty search reads, and the mark records tracking
// reports through its onMarkChanged hook. app.ts creates it before tracking.
import type { FastifyPluginAsync } from "fastify";
import type { RealnessDeps } from "./app/deps.js";
import { onMarkChanged } from "./app/records.js";
import { realnessRoutes } from "./ports/routes.js";

export type { RealnessDeps } from "./app/deps.js";

export function createRealness(deps: RealnessDeps) {
  const plugin: FastifyPluginAsync = async (app) => {
    await app.register(realnessRoutes(deps));
  };
  return {
    plugin,
    onMarkChanged: (postingId: string, mark: "applied" | "skipped" | null) =>
      onMarkChanged(deps, postingId, mark),
  };
}
