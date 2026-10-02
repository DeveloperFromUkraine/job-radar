// Pruning of the module's own history (sad §7): ledger rows older than 24 h, runs and app sessions
// older than 60 days.
import { lt } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import { appSessions, requestLedger, runs } from "../schema.js";

const DAY = 24 * 60 * 60 * 1000;

export function pruneHistory(db: Db, now: number): void {
  db.transaction((tx) => {
    tx.delete(requestLedger)
      .where(lt(requestLedger.sentAt, now - DAY))
      .run();
    tx.delete(runs)
      .where(lt(runs.startedAt, now - 60 * DAY))
      .run();
    tx.delete(appSessions)
      .where(lt(appSessions.lastSeenAt, now - 60 * DAY))
      .run();
  });
}
