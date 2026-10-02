// The one way to call a source (sad §8 Outbound HTTP): the read is checked against the source's
// rolling windows and written to the ledger before it is sent; 30 s timeout, 10 MB cap, fixed
// User-Agent. Every failure is data (a reason code), never an exception.
import type { Db } from "../../../core/db.js";
import type { FailureCode } from "../domain/adapter.js";
import { windowAllows } from "../domain/schedule.js";
import type { SourceDefinition } from "../domain/sources.js";
import { readTimesSince, recordRead } from "./repo/sources.js";

const DAY = 24 * 60 * 60 * 1000;
export const USER_AGENT = "job-radar (personal use)";

export type HttpResult =
  | { kind: "ok"; body: unknown }
  | { kind: "limited" } // the window is used up: the fetch ends as partial, not failed
  | { kind: "failed"; failure: { code: FailureCode; detail: string } };

export interface SourceHttp {
  getJson(url: string): Promise<HttpResult>;
}

export interface SourceHttpOptions {
  now: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  /** Shutdown: an aborted read throws instead of recording a source failure. */
  signal?: AbortSignal;
}

export class CollectorStopping extends Error {
  constructor() {
    super("the collector is stopping");
    this.name = "CollectorStopping";
  }
}

export function createSourceHttp(db: Db, source: SourceDefinition, options: SourceHttpOptions): SourceHttp {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const fail = (code: FailureCode, detail: string): HttpResult => ({
    kind: "failed",
    failure: { code, detail },
  });

  return {
    async getJson(url) {
      const now = options.now();
      if (!windowAllows(source, readTimesSince(db, source.id, now - DAY), now)) return { kind: "limited" };
      recordRead(db, source.id, now);

      const abort = new AbortController();
      let tooLarge = false;
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const signal = options.signal ? AbortSignal.any([abort.signal, options.signal]) : abort.signal;
        const res = await fetch(url, {
          headers: { "user-agent": USER_AGENT, accept: "application/json" },
          signal,
        });
        if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 451) {
          return fail("refused", `HTTP ${res.status}`);
        }
        if (!res.ok) return fail("unreachable", `HTTP ${res.status}`);

        const chunks: Uint8Array[] = [];
        let size = 0;
        if (res.body) {
          for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
            size += chunk.byteLength;
            if (size > maxBytes) {
              tooLarge = true;
              abort.abort();
              break;
            }
            chunks.push(chunk);
          }
        }
        if (tooLarge) return fail("too_large", `over ${maxBytes} bytes`);
        try {
          return { kind: "ok", body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
        } catch {
          return fail("unreadable", "not JSON");
        }
      } catch (err) {
        if (options.signal?.aborted) throw new CollectorStopping();
        if (tooLarge) return fail("too_large", `over ${maxBytes} bytes`);
        if (abort.signal.aborted) return fail("timed_out", `no answer within ${timeoutMs} ms`);
        return fail("unreachable", (err as Error).message);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
