// Tracking HTTP routes (docs/features/applied-skipped/contracts/openapi.yaml). Both change state, so
// both are JSON POSTs; access rules (collector ADR-0007) apply app-wide in core/ (AC-16).
import type { FastifyPluginAsync } from "fastify";
import type { TrackingDeps } from "../app/deps.js";
import { setMark, undoMark } from "../app/marks.js";
import type { Mark } from "../domain/mark.js";

const postingParams = {
  type: "object",
  required: ["posting_id"],
  properties: { posting_id: { type: "string", format: "uuid" } },
} as const;

type PostingRoute = { Params: { posting_id: string } };

// Fastify's AJV strips unknown properties instead of rejecting them; maxProperties makes an extra
// field a 400, as the contract's additionalProperties: false requires.

export function trackingRoutes(deps: TrackingDeps): FastifyPluginAsync {
  return async (app) => {
    app.post<PostingRoute & { Body: { mark: Mark | null } }>(
      "/api/v1/tracking/marks/:posting_id",
      {
        schema: {
          params: postingParams,
          body: {
            type: "object",
            required: ["mark"],
            additionalProperties: false,
            maxProperties: 1,
            properties: { mark: { type: ["string", "null"], enum: ["applied", "skipped", null] } },
          },
        },
      },
      async (request) => setMark(deps, request.params.posting_id, request.body.mark),
    );

    app.post<PostingRoute & { Body: { change_id: string } }>(
      "/api/v1/tracking/marks/:posting_id/undo",
      {
        schema: {
          params: postingParams,
          body: {
            type: "object",
            required: ["change_id"],
            additionalProperties: false,
            maxProperties: 1,
            properties: { change_id: { type: "string", format: "uuid" } },
          },
        },
      },
      async (request) => undoMark(deps, request.params.posting_id, request.body.change_id),
    );
  };
}
