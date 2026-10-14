import type { Db } from "../../../core/db.js";

export interface TrackingLog {
  info(obj: object, msg?: string): void;
}

/** What tracking's use cases need; the clock is injected so grace and undo are testable. */
export interface TrackingDeps {
  db: Db;
  now: () => number;
  /** The owner's time zone — the same one clean-up uses for its calendar day (grace day, AC-07). */
  timeZone: string;
  log?: TrackingLog;
}
