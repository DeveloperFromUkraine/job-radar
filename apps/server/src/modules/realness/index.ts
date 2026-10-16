// The realness module (ADR-0001): the switch now; the penalty search reads and the mark records
// tracking reports to come with assess() and onMarkChanged. app.ts creates it before tracking.
import type { FastifyPluginAsync } from "fastify";
import type { RealnessDeps } from "./app/deps.js";
import { realnessRoutes } from "./ports/routes.js";

export type { RealnessDeps } from "./app/deps.js";

export function createRealness(deps: RealnessDeps) {
  const plugin: FastifyPluginAsync = async (app) => {
    await app.register(realnessRoutes(deps));
  };
  return { deps, plugin };
}
