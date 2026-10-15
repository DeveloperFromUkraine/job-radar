import type { MatchingConfig } from "../../../core/config.js";
import type { Db } from "../../../core/db.js";
import type { Provider } from "../infra/claude.js";

export interface MatchingLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/** What matching's use cases need; the clock and the provider are injected so every rule is testable. */
export interface MatchingDeps {
  db: Db;
  now: () => number;
  /** The machine's zone: the calendar month of the scoring cap (sad.md §8 Time). */
  timeZone: string;
  config: MatchingConfig;
  /** Default: the Claude client from `config`. Tests pass the stand-in provider. */
  provider?: Provider;
  /** Wakes the scorer at once: after a profile change, a raised cap, or a new list (sad.md §5). */
  wakeScorer: () => void;
  log?: MatchingLog;
  /** The last scoring reservation the cap refused this month; cap-state reads it (AC-12, review R1). */
  capRefused?: { monthStart: number; cost: number };
}
