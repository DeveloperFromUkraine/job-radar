// The collector's read-only location exports for remote-filter (remote-filter sad §5): the explicit
// "Anywhere" rule and which sources are enabled — an open listing counts only from an enabled source.
import type { Db } from "../../../core/db.js";
import { sourceState } from "../domain/settings.js";
import { SOURCES, type SourceId } from "../domain/sources.js";
import { settingsInForce } from "./source-health.js";

export { isStatedAnywhere } from "../domain/listing.js";

export function enabledSourceIds(db: Db): Set<SourceId> {
  const settings = settingsInForce(db);
  return new Set(SOURCES.filter((s) => sourceState(settings, s) === "enabled").map((s) => s.id));
}
