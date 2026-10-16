import type { Db } from "../../../core/db.js";
import type { Mark } from "../domain/mark.js";

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
  /** Told after a mark is saved, with the resulting mark (null = none); realness-score ADR-0001. */
  onMarkChanged?: (postingId: string, mark: Mark | null) => void;
}
