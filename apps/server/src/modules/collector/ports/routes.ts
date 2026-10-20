// Collector HTTP routes (contracts/openapi.yaml). Access rules (ADR-0007) apply app-wide in core/.
import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../../../core/errors.js";
import { addCompany, type CompaniesOptions, companiesList, removeCompany } from "../app/companies.js";
import type { CollectorDeps } from "../app/deps.js";
import type { NextDue } from "../app/open-run.js";
import { openRun } from "../app/open-run.js";
import type { StartedRun } from "../app/scheduler.js";
import { getProblems, getSourceHealth, runJsonById } from "../app/source-health.js";
import { type BoardRef, boardPage } from "../domain/ats.js";
import type { CompanyRow } from "../infra/repo/companies.js";

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

const companyJson = (c: CompanyRow) => ({
  id: c.id,
  name: c.name,
  ats: c.ats,
  slug: c.slug,
  board_url: boardPage(c as BoardRef),
  origin: c.origin,
  added_at: iso(c.addedAt),
  last_checked_at: iso(c.lastCheckedAt),
  last_result: c.lastResult,
  open_roles: c.openRoles,
});

const nextDueJson = (n: NextDue) => ({
  source_id: n.sourceId,
  state: n.state,
  next_due_at: n.nextDueAt === null ? null : new Date(n.nextDueAt).toISOString(),
});

/** `startRun` hands an opened run to the pipeline in the background; the answer does not wait for it. */
export function collectorRoutes(
  deps: CollectorDeps,
  startRun: (run: StartedRun) => void = () => {},
  companies: CompaniesOptions = {},
): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/v1/collector/problems", async () => getProblems(deps));
    app.get("/api/v1/collector/source-health", async () => getSourceHealth(deps));

    app.get("/api/v1/collector/companies", async () => ({ companies: companiesList(deps).map(companyJson) }));

    app.post<{ Body: { url: string } }>(
      "/api/v1/collector/companies",
      {
        schema: {
          body: {
            type: "object",
            required: ["url"],
            additionalProperties: false,
            properties: { url: { type: "string", minLength: 3, maxLength: 500 } },
          },
        },
      },
      async (request, reply) => {
        const result = await addCompany(deps, request.body.url, companies);
        if (result.kind === "invalid") {
          throw new AppError("COLLECTOR_COMPANY_INVALID", "Enter a company site or a job board link.", 422);
        }
        if (result.kind === "not_found") {
          throw new AppError(
            "COLLECTOR_COMPANY_NO_BOARD",
            "No Greenhouse, Lever or Ashby board was found for this company.",
            422,
          );
        }
        if (result.kind === "unavailable") {
          throw new AppError(
            "COLLECTOR_COMPANY_UNAVAILABLE",
            "The job boards could not be checked right now. Try again in a few minutes.",
            503,
          );
        }
        return reply.status(result.kind === "added" ? 201 : 200).send(companyJson(result.company));
      },
    );

    app.delete<{ Params: { id: string } }>(
      "/api/v1/collector/companies/:id",
      // The empty JSON object, as collect-now: cross-site attempts need a preflight (ADR-0007).
      { schema: { body: { type: "object", additionalProperties: false, maxProperties: 0 } } },
      async (request, reply) => {
        if (!removeCompany(deps, request.params.id)) {
          throw new AppError("COLLECTOR_COMPANY_NOT_FOUND", "No such company on the list.", 404);
        }
        return reply.status(204).send();
      },
    );

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
