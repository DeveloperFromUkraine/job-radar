// In-memory result snapshots (ADR-0003): at most 20, least recently used evicted first, 2 h idle expiry.
import { newId } from "../../../core/id.js";
import type { Realness } from "../../realness/domain/signals.js";
import type { LocationCheck } from "../../remote-filter/app/verdicts.js";

export interface Snapshot {
  id: string;
  skills: string[];
  loadedAt: number;
  /** The previous-visit start the new marks were decided against. */
  previousVisitStartedAt: number | null;
  /** Posting ids in list order: the shown ones only, marked ones included (remote-filter sad §5). */
  ids: string[];
  newCount: number;
  /** The country the list was filtered for; null when the filter is off or none (remote-filter AC-09). */
  filterCountry?: string | null;
  hiddenCount?: number;
  /** Each shown posting's "check location" reason, decided when the snapshot was built. */
  checks?: ReadonlyMap<string, LocationCheck>;
  /** Each shown posting's realness when realness was on, fixed with the snapshot (realness-score ADR-0002). */
  realness?: ReadonlyMap<string, Realness>;
  /** A marked-view snapshot (applied-skipped AC-05); paged only by its own route. */
  marked?: true;
}

export const MAX_SNAPSHOTS = 20;
export const SNAPSHOT_IDLE_MS = 2 * 3_600_000;

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;

export function createSnapshotStore(now: () => number) {
  // Map order = least recently used first.
  const items = new Map<string, { snapshot: Snapshot; usedAt: number }>();
  const drop = (id: string) => items.delete(id);

  return {
    create(data: Omit<Snapshot, "id">): Snapshot {
      const snapshot = { id: newId(), ...data };
      items.set(snapshot.id, { snapshot, usedAt: now() });
      while (items.size > MAX_SNAPSHOTS) drop(items.keys().next().value as string);
      return snapshot;
    },
    /** Unknown or expired → undefined; a read resets the idle time. */
    get(id: string): Snapshot | undefined {
      const item = items.get(id);
      if (!item) return undefined;
      drop(id);
      if (now() - item.usedAt > SNAPSHOT_IDLE_MS) return undefined;
      items.set(id, { snapshot: item.snapshot, usedAt: now() });
      return item.snapshot;
    },
    size: () => items.size,
  };
}
