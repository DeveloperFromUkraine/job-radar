// Collector HTTP routes (contracts/openapi.yaml). Access rules (ADR-0007) apply app-wide in core/.
import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../../../core/errors.js";
import type { CollectorDeps } from "../app/deps.js";
import type { NextDue } from "../app/open-run.js";
import { openRun } from "../app/open-run.js";
import type { StartedRun } from "../app/scheduler.js";
import { getProblems, getSourceHealth, runJsonById } from "../app/source-health.js";

const nextDueJson = (n: NextDue) => ({
  source_id: n.sourceId,
  state: n.state,
  next_due_at: n.nextDueAt === null ? null : new Date(n.nextDueAt).toISOString(),
});

/** `startRun` hands an opened run to the pipeline in the background; the answer does not wait for it. */
export function collectorRoutes(
  deps: CollectorDeps,
  startRun: (run: StartedRun) => void = () => {},
): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/v1/collector/problems", async () => getProblems(deps));
    app.get("/api/v1/collector/source-health", async () => getSourceHealth(deps));

    app.post(
      "/api/v1/collector/runs",
      // Always the empty object: a JSON body is required so cross-site attempts need a preflight (ADR-0007).
      { schema: { body: { type: "object", additionalProperties: false, maxProperties: 0 } } },
      async (_request, reply) => {
        const result = openRun(deps, "collect_now");
        if (result.kind === "already_running") {
          throw new AppError("COLLECTOR_RUN_IN_PROGRESS", "A collection run is already in progress.", 409);
        }
        if (result.kind === "nothing_due") {
          return reply
            .status(200)
            .send({ started: false, run: null, next_due: result.nextDue.map(nextDueJson) });
        }
        startRun(result);
        return reply.status(202).send({
          started: true,
          run: runJsonById(deps, result.runId),
          next_due: result.nextDue.map(nextDueJson),
        });
      },
    );
  };
}
