// Search HTTP routes (docs/features/search-postings/contracts/openapi.yaml). All four change state, so
// all are JSON POSTs; access rules (collector ADR-0007) apply app-wide in core/.
import type { FastifyPluginAsync } from "fastify";
import type { SearchDeps } from "../app/deps.js";
import { nextPage } from "../app/pages.js";
import { runSearch } from "../app/search.js";
import type { SnapshotStore } from "../app/snapshots.js";
import { openVisit } from "../app/visits.js";
import { waitingCount } from "../app/waiting.js";

const empty = { type: "object", additionalProperties: false, maxProperties: 0 } as const;
const snapshotParams = {
  type: "object",
  required: ["snapshot_id"],
  properties: { snapshot_id: { type: "string", format: "uuid" } },
} as const;

type SnapshotRoute = { Params: { snapshot_id: string } };

export function searchRoutes(deps: SearchDeps, snapshots: SnapshotStore): FastifyPluginAsync {
  return async (app) => {
    app.post("/api/v1/search/visits", { schema: { body: empty } }, async () => {
      const visit = openVisit(deps);
      const previous = visit.previousVisitStartedAt;
      return {
        last_skills: visit.lastSkills,
        previous_visit_started_at: previous === null ? null : new Date(previous).toISOString(),
      };
    });

    app.post<{ Body: { skills: string } }>(
      "/api/v1/search/snapshots",
      {
        schema: {
          body: {
            type: "object",
            required: ["skills"],
            additionalProperties: false,
            properties: { skills: { type: "string" } },
          },
        },
      },
      async (request) => runSearch(deps, snapshots, request.body.skills),
    );

    app.post<SnapshotRoute & { Body: { cursor: string } }>(
      "/api/v1/search/snapshots/:snapshot_id/pages",
      {
        schema: {
          params: snapshotParams,
          body: {
            type: "object",
            required: ["cursor"],
            additionalProperties: false,
            properties: { cursor: { type: "string", pattern: "^[0-9]{1,6}$" } },
          },
        },
      },
      async (request) => nextPage(deps, snapshots, request.params.snapshot_id, request.body.cursor),
    );

    app.post<SnapshotRoute>(
      "/api/v1/search/snapshots/:snapshot_id/waiting",
      { schema: { params: snapshotParams, body: empty } },
      async (request) => waitingCount(deps, snapshots, request.params.snapshot_id),
    );
  };
}
