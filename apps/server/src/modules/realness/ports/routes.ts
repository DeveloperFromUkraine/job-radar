// Realness HTTP routes (docs/features/realness-score/contracts/openapi.yaml). The POST sits behind the
// global access guard (collector ADR-0007, AC-12).
import type { FastifyPluginAsync } from "fastify";
import type { RealnessDeps } from "../app/deps.js";
import { isOn, setOn } from "../app/settings.js";

// maxProperties: Fastify's AJV strips unknown properties; the contract's additionalProperties: false wants a 400.
const onBody = {
  type: "object",
  required: ["on"],
  additionalProperties: false,
  maxProperties: 1,
  properties: { on: { type: "boolean" } },
} as const;

export function realnessRoutes(deps: RealnessDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/v1/realness/settings", async () => ({ realness_on: isOn(deps) }));
    app.post<{ Body: { on: boolean } }>(
      "/api/v1/realness/settings",
      { schema: { body: onBody } },
      async (request) => ({ realness_on: setOn(deps, request.body.on) }),
    );
  };
}
