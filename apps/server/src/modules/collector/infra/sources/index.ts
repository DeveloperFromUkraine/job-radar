import type { SourceId } from "../../domain/sources.js";
import { himalayasAdapter } from "./himalayas.js";
import { jobicyAdapter } from "./jobicy.js";
import { remotiveAdapter } from "./remotive.js";
import type { SourceAdapter } from "./types.js";
import { weWorkRemotelyAdapter } from "./weworkremotely.js";

/** One adapter per registry source; `baseUrl` points every source at a fake server in tests. */
export function createAdapters(options: { baseUrl?: string } = {}): Record<SourceId, SourceAdapter> {
  const { baseUrl } = options;
  return {
    jobicy: jobicyAdapter(baseUrl),
    himalayas: himalayasAdapter(baseUrl),
    remotive: remotiveAdapter(baseUrl),
    weworkremotely: weWorkRemotelyAdapter(),
  };
}
