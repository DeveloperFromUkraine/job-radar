// The remote-filter module (ADR-0001): the owner's country, on/off state and one-off look, the country
// list, and the location verdicts search asks for. app.ts creates it before search so search can be
// handed its reader without importing remote-filter's internals.
import type { FastifyPluginAsync } from "fastify";
import type { RemoteFilterDeps } from "./app/deps.js";
import { remoteFilterRoutes } from "./ports/routes.js";

export type { RemoteFilterDeps } from "./app/deps.js";

export function createRemoteFilter(deps: RemoteFilterDeps) {
  const plugin: FastifyPluginAsync = async (app) => {
    await app.register(remoteFilterRoutes(deps));
  };
  return { deps, plugin };
}
