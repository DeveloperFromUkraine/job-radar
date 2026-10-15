// The background scorer (ADR-0003, sad.md §5 and §6 flows 1, 7): a pass every 60 s and at once on
// wake(); one attempt at a time; the owner's list (search's export) decides what is scored. Postings with
// no score come first, then stale ones, each newest first; a pass ends at the cap or on a provider
// problem. A provider problem is tried again after 15 minutes, a key problem only after a restart (AC-14).
import type { OpenPosting } from "../../collector/app/open-postings.js";
import { scoringNeed, textFingerprint } from "../domain/score.js";
import * as repo from "../infra/repo.js";
import { scoreOne } from "./attempt.js";
import { capState } from "./cap-state.js";
import type { MatchingDeps } from "./deps.js";
import { scoredText } from "./scored-text.js";

export const PROVIDER_RETRY_MS = 15 * 60_000;

export interface Scorer {
  start(): void;
  /** Runs a pass now, or another one right after the pass in progress. */
  wake(): void;
  /** One pass (tests drive it directly). */
  pass(): Promise<void>;
  stop(): Promise<void>;
}

export function createScorer(
  deps: MatchingDeps,
  options: { ownerList: () => OpenPosting[]; intervalMs?: number; onError?: (err: unknown) => void },
): Scorer {
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | null = null;
  let again = false;
  let stopping = false;
  /** In memory: a restart is how a fixed key is picked up (AC-14). */
  let keyBlocked = false;
  let retryAfter = 0;

  /**
   * The next posting to score, read fresh before every attempt so a posting marked or hidden before its
   * turn is never scored (AC-13) and a new posting jumps ahead of stale ones (freshness NFR).
   */
  // ponytail: re-reads the whole list per attempt (~100 ms at 10,000 postings, attempts take seconds);
  // keep a queue keyed by fingerprint if the list grows past that.
  const next = (): OpenPosting | null => {
    const settings = repo.readSettings(deps.db);
    const list = options.ownerList();
    const rows = repo.scoresFor(
      deps.db,
      list.map((p) => p.id),
    );
    let stale: OpenPosting | null = null;
    for (const p of list) {
      const need = scoringNeed(rows.get(p.id), {
        textFingerprint: textFingerprint(scoredText(p)),
        profileVersion: settings.profileVersion,
        problem: null,
        capReached: false,
      });
      if (need === "unscored") return p;
      if (need === "stale" && !stale) stale = p;
    }
    return stale;
  };

  const pass = async () => {
    if (keyBlocked || deps.now() < retryAfter) return;
    while (!stopping) {
      const settings = repo.readSettings(deps.db);
      if (!settings.profile || capState(deps).reached) return;
      const posting = next();
      if (!posting) return;
      const result = await scoreOne(deps, posting, settings.profile, settings.profileVersion);
      if (result.kind === "cap_reached") return;
      if (result.kind === "provider_problem") {
        if (result.problem === "key_missing" || result.problem === "key_refused") keyBlocked = true;
        else retryAfter = deps.now() + PROVIDER_RETRY_MS;
        return;
      }
    }
  };

  const run = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        try {
          await pass();
        } catch (err) {
          options.onError?.(err);
        }
      } while (again && !stopping);
      running = null;
    })();
    return running;
  };

  return {
    start() {
      void run();
      timer = setInterval(() => void run(), options.intervalMs ?? 60_000);
    },
    wake: () => void run(),
    pass,
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
