import { describe, expect, it } from "vitest";
import { createSnapshotStore } from "./snapshots.js";

const HOUR = 3_600_000;
const data = (n: number) => ({
  skills: [],
  loadedAt: n,
  previousVisitStartedAt: null,
  ids: [`p${n}`],
  newCount: 0,
});

describe("snapshot store (ADR-0003, sad §7)", () => {
  it("keeps at most 20, evicting the least recently used first", () => {
    let now = 0;
    const store = createSnapshotStore(() => now);
    const first = store.create(data(0));
    const second = store.create(data(1));
    for (let i = 2; i < 20; i++) store.create(data(i));
    now = 1;
    store.get(first.id); // used again: no longer the oldest
    store.create(data(20));
    expect(store.size()).toBe(20);
    expect(store.get(first.id)).toBeDefined();
    expect(store.get(second.id)).toBeUndefined();
  });

  it("expires a snapshot after 2 h idle; each read resets the idle time", () => {
    let now = 0;
    const store = createSnapshotStore(() => now);
    const s = store.create(data(0));
    now = 2 * HOUR;
    expect(store.get(s.id)).toEqual(s);
    now = 4 * HOUR;
    expect(store.get(s.id)).toBeDefined();
    now = 6 * HOUR + 1;
    expect(store.get(s.id)).toBeUndefined();
  });

  it("returns undefined for an unknown id", () => {
    expect(createSnapshotStore(() => 0).get("nope")).toBeUndefined();
  });
});
