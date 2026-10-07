// Owner marks live outside the collector (ADR-0006). Before removing anything, the collector asks
// this port which posting ids carry an applied or skipped mark. Roadmap step 6 (tracking) provides
// the real implementation; until then nothing is marked.
export interface MarkedPostings {
  markedAmong(postingIds: readonly string[]): Promise<ReadonlySet<string>>;
}

export const noMarks: MarkedPostings = {
  markedAmong: async () => new Set<string>(),
};
