import type { Db } from "../../../core/db.js";
import type { SourceId } from "../domain/sources.js";
import type { SourceAdapter } from "../infra/sources/types.js";

/** What the collector's use cases need; the clock is injected so every rule is testable. */
export interface CollectorDeps {
  db: Db;
  now: () => number;
  settingsFile: string;
  adapters: Record<SourceId, SourceAdapter>;
  /** The owner's machine time zone — the daily clean-up's calendar day (AC-10). */
  timeZone: string;
}
