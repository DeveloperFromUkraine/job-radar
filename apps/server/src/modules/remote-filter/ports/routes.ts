// Remote-filter HTTP routes (docs/features/remote-filter/contracts/openapi.yaml). The GET is read-only;
// the three POSTs change state and sit behind the global access guard (collector ADR-0007, AC-12).
import type { FastifyPluginAsync } from "fastify";
import type { RemoteFilterDeps } from "../app/deps.js";
import {
  chooseCountry,
  getSettings,
  type RemoteFilterSettings,
  setFilterOn,
  setLook,
} from "../app/settings.js";

const name = { type: "string", minLength: 1, maxLength: 100 } as const;

// Fastify's AJV strips unknown properties instead of rejecting them; maxProperties makes an extra
// field a 400, as the contract's additionalProperties: false requires.
const body = (properties: Record<string, object>) =>
  ({
    type: "object",
    required: Object.keys(properties),
    additionalProperties: false,
    maxProperties: Object.keys(properties).length,
    properties,
  }) as const;

const toBody = (s: RemoteFilterSettings) => ({
  country: s.country,
  filter_on: s.filterOn,
  countries: s.countries,
});

export function remoteFilterRoutes(deps: RemoteFilterDeps): FastifyPluginAsync {
  return async (app) => {
    app.get("/api/v1/remote-filter/settings", async () => toBody(getSettings(deps)));

    app.post<{ Body: { name: string } }>(
      "/api/v1/remote-filter/country",
      { schema: { body: body({ name }) } },
      async (request) => toBody(chooseCountry(deps, request.body.name)),
    );

    app.post<{ Body: { on: boolean } }>(
      "/api/v1/remote-filter/filter",
      { schema: { body: body({ on: { type: "boolean" } }) } },
      async (request) => toBody(setFilterOn(deps, request.body.on)),
    );

    app.post<{ Body: { name: string | null } }>(
      "/api/v1/remote-filter/look",
      // A type union, not anyOf: under anyOf Fastify's AJV coerces "" to null and would end the look.
      { schema: { body: body({ name: { ...name, type: ["string", "null"] } }) } },
      async (request) => setLook(deps, request.body.name),
    );
  };
}
