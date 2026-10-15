// Owner marks live outside the collector (ADR-0006, partly superseded by applied-skipped ADR-0003).
// Before removing anything, the collector asks this port which posting ids are protected: marked
// applied, or within the grace day after losing applied. Tracking provides the real implementation
// (wired in app.ts); the stub protects nothing.
export interface ProtectedPostings {
  protectedAmong(postingIds: readonly string[]): Promise<ReadonlySet<string>>;
}

export const noMarks: ProtectedPostings = {
  protectedAmong: async () => new Set<string>(),
};
