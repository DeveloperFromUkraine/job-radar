import type { ProtectedPostings } from "../../src/modules/collector/app/marked-postings.js";

// Stands in for tracking's port in collector tests (applied-skipped data-model §Test fixtures).
export const fakeProtectedPostings = (protectedIds: string[]): ProtectedPostings => ({
  protectedAmong: async () => new Set(protectedIds),
});
