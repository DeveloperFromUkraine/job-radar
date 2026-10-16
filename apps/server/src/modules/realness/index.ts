// The realness module (ADR-0001): the switch, the penalty search reads, and the mark records tracking
// reports through its onMarkChanged hook. app.ts creates it before tracking.
import type { FastifyPluginAsync } from "fastify";
import type { FilterMode } from "../remote-filter/app/settings.js";
import type { RealnessDeps } from "./app/deps.js";
import { noteListShown, onMarkChanged } from "./app/records.js";
import type { Realness } from "./domain/signals.js";
import { realnessRoutes } from "./ports/routes.js";

export type { RealnessDeps } from "./app/deps.js";

export function createRealness(deps: RealnessDeps) {
  const plugin: FastifyPluginAsync = async (app) => {
    await app.register(realnessRoutes(deps));
  };
  return {
    deps,
    plugin,
    onMarkChanged: (postingId: string, mark: "applied" | "skipped" | null) =>
      onMarkChanged(deps, postingId, mark),
    noteListShown: (assessments: ReadonlyMap<string, Realness>, filterMode: FilterMode) =>
      noteListShown(deps, assessments, filterMode),
  };
}
