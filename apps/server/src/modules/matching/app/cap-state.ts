// Whether this month's cap is reached (AC-12): the smallest attempt — its output limit at the output
// price, with no input at all — no longer fits in what is left, or the scorer's last reservation this
// month was refused and still does not fit (a raised cap clears it by itself).
// ponytail: the refusal lives in memory, so after a restart "reached" waits for the scorer's first pass.
import { fits, maxCostMicros, monthWindow } from "../domain/spend.js";
import * as repo from "../infra/repo.js";
import type { MatchingDeps } from "./deps.js";

export function capState(deps: MatchingDeps) {
  const window = monthWindow(deps.now(), deps.timeZone);
  const spent = repo.monthSpend(deps.db, window.start);
  const cap = repo.readSettings(deps.db).capUsdMicros;
  const smallest = maxCostMicros(0, deps.config.scoreOutputLimit, deps.config.price);
  const refused = deps.capRefused?.monthStart === window.start ? deps.capRefused.cost : smallest;
  return { window, spent, cap, reached: !fits({ spent, cost: Math.max(smallest, refused), cap }) };
}
