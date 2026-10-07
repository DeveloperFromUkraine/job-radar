// Seeds for tracking tests (docs/features/applied-skipped/data-model.md §Test fixtures). Inserts mark
// rows directly, with fresh UUIDv7 change ids.
import type { Db } from "../../src/core/db.js";
import { newId } from "../../src/core/id.js";
import type { Mark } from "../../src/modules/tracking/domain/mark.js";
import { trackingMarks } from "../../src/modules/tracking/infra/schema.js";

export function seedMarks(
  db: Db,
  postingIds: readonly string[],
  opts: { mark: Mark | null; markedAt?: number; appliedLostAt?: number | null },
): void {
  db.transaction((tx) => {
    for (const postingId of postingIds)
      tx.insert(trackingMarks)
        .values({
          postingId,
          mark: opts.mark,
          markedAt: opts.markedAt ?? 1,
          appliedLostAt: opts.appliedLostAt ?? null,
          changeId: newId(),
        })
        .run();
  });
}
