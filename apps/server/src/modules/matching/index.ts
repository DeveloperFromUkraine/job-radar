// The matching module (match-score ADR-0001): the profile, the CV draft, the scoring cap, scoring health
// and the background scorer, in the server process. app.ts creates it before search so search can be
// handed its score reader (ADR-0004), and hands it search's owner list in return.
import type { FastifyPluginAsync } from "fastify";
import type { MatchingConfig } from "../../core/config.js";
import type { Db } from "../../core/db.js";
import type { OpenPosting } from "../collector/app/open-postings.js";
import type { MatchingDeps } from "./app/deps.js";
import { createScoreReader } from "./app/score-reader.js";
import { createScorer } from "./app/scorer.js";
import type { Provider } from "./infra/claude.js";
import { matchingRoutes } from "./ports/routes.js";

export interface MatchingOptions {
  db: Db;
  now: () => number;
  timeZone: string;
  config: MatchingConfig;
  /** Search's owner list (ADR-0004): what is scored. */
  ownerList: () => OpenPosting[];
  /** Default: the Claude client. Tests pass the stand-in provider. */
  provider?: Provider;
  /** false: no background scorer (tests drive scoring directly). */
  scorer?: boolean;
}

export function createMatching(options: MatchingOptions) {
  // The scorer is created after the deps it wakes through; the closure reads it at call time.
  let wake = () => {};
  const deps: MatchingDeps = {
    db: options.db,
    now: options.now,
    timeZone: options.timeZone,
    config: options.config,
    provider: options.provider,
    wakeScorer: () => wake(),
  };
  const scorer = createScorer(deps, { ownerList: options.ownerList });
  if (options.scorer !== false) wake = () => scorer.wake();

  const plugin: FastifyPluginAsync = async (app) => {
    const log = app.log.child({ module: "matching" });
    deps.log = { info: (o, m) => log.info(o, m), warn: (o, m) => log.warn(o, m) };
    await app.register(matchingRoutes(deps, options.ownerList));
    if (options.scorer !== false) {
      app.addHook("onReady", async () => scorer.start());
      app.addHook("onClose", async () => scorer.stop());
    }
  };
  return { deps, plugin, scoreReader: createScoreReader(deps), scorer };
}
