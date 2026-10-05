// In-memory result snapshots (ADR-0003): at most 20, least recently used evicted first, 2 h idle expiry.
import { newId } from "../../../core/id.js";

export interface Snapshot {
  id: string;
  skills: string[];
  loadedAt: number;
  /** The previous-visit start the new marks were decided against. */
  previousVisitStartedAt: number | null;
  /** Posting ids in list order. */
  ids: string[];
  newCount: number;
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
