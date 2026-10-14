// Seeds for remote-filter tests (docs/features/remote-filter/data-model.md §Test fixtures): upserts the
// singleton settings row, for no-country, off, and look scenarios under a fake clock.
import type { Db } from "../../src/core/db.js";
import { remoteFilterSettings } from "../../src/modules/remote-filter/infra/schema.js";

type Settings = typeof remoteFilterSettings.$inferInsert;

export function setRemoteFilterSettings(db: Db, partial: Partial<Omit<Settings, "id">>): void {
  db.insert(remoteFilterSettings)
    .values({ id: 1, filterOn: true, ...partial })
    .onConflictDoUpdate({ target: remoteFilterSettings.id, set: partial })
    .run();
}
