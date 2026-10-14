import type { Db } from "../../../core/db.js";

/** What remote-filter's use cases need; the clock is injected so a look's visit is testable. */
export interface RemoteFilterDeps {
  db: Db;
  now: () => number;
}
