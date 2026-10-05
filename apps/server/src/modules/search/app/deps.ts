import type { Db } from "../../../core/db.js";

/** What search's use cases need; the clock is injected so every rule is testable. */
export interface SearchDeps {
  db: Db;
  now: () => number;
}
