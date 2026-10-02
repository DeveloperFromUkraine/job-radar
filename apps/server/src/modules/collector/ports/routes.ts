// Collector HTTP routes (contracts/openapi.yaml). Access rules (ADR-0007) apply app-wide in core/.
import type { FastifyPluginAsync } from "fastify";
import type { CollectorDeps } from "../app/deps.js";
import { getProblems, getSourceHealth } from "../app/source-health.js";

export function collectorRoutes(deps: CollectorDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/v1/collector/problems", async () => getProblems(deps));
    app.get("/api/v1/collector/source-health", async () => getSourceHealth(deps));
  };
}
