// Whether this month's cap is reached (AC-12): the smallest attempt — its output limit at the output
// price, with no input at all — no longer fits in what is left. A real attempt reserves more, so
// "not reached" can still refuse one; "reached" never lets one through.
import { fits, maxCostMicros, monthWindow } from "../domain/spend.js";
import * as repo from "../infra/repo.js";
import type { MatchingDeps } from "./deps.js";

export function capState(deps: MatchingDeps) {
  const window = monthWindow(deps.now(), deps.timeZone);
  const spent = repo.monthSpend(deps.db, window.start);
  const cap = repo.readSettings(deps.db).capUsdMicros;
  const smallest = maxCostMicros(0, deps.config.scoreOutputLimit, deps.config.price);
  return { window, spent, cap, reached: !fits({ spent, cost: smallest, cap }) };
}
