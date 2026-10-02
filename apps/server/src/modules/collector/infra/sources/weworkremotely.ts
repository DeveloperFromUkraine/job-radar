// We Work Remotely: disabled until spec §8 Q1 (its limits and location data) is answered — its
// terms, API and feed pages answered 403 on 2026-10-02. Its allowed rate is 0, so it is never due
// and the ledgered HTTP client would refuse a read anyway; this adapter never sends a request.
import type { FetchResult } from "../../domain/adapter.js";
import type { SourceAdapter } from "./types.js";

export function weWorkRemotelyAdapter(): SourceAdapter {
  return {
    id: "weworkremotely",
    async fetchLatest(): Promise<FetchResult> {
      return { completeness: "partial", listings: [], itemsReturned: 0, coversPublishedAfter: null };
    },
  };
}
