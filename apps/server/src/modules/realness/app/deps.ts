import type { Db } from "../../../core/db.js";

/** What realness's use cases need; the clock and the owner's time zone are injected (calendar days). */
export interface RealnessDeps {
  db: Db;
  now: () => number;
  timeZone: string;
  log?: RealnessLog;
}

export interface RealnessLog {
  warn(obj: object, msg?: string): void;
}
