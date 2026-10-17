import type { SourceId } from "../../domain/sources.js";
import { bulldogjobAdapter } from "./bulldogjob.js";
import { djinniAdapter } from "./djinni.js";
import { douAdapter } from "./dou.js";
import { himalayasAdapter } from "./himalayas.js";
import { importedAdapter } from "./imported.js";
import { jobicyAdapter } from "./jobicy.js";
import { justJoinItAdapter } from "./justjoinit.js";
import { noFluffJobsAdapter } from "./nofluffjobs.js";
import { remoteOkAdapter } from "./remoteok.js";
import { remotiveAdapter } from "./remotive.js";
import type { SourceAdapter } from "./types.js";
import { weWorkRemotelyAdapter } from "./weworkremotely.js";
import { workingNomadsAdapter } from "./workingnomads.js";

/**
 * One adapter per registry source; `baseUrl` points every source at a fake server in tests, and
 * `importsDir` is where the imported sources' files live (none: nothing is imported).
 */
export function createAdapters(
  options: { baseUrl?: string; importsDir?: string } = {},
): Record<SourceId, SourceAdapter> {
  const { baseUrl, importsDir } = options;
  return {
    jobicy: jobicyAdapter(baseUrl),
    himalayas: himalayasAdapter(baseUrl),
    remotive: remotiveAdapter(baseUrl),
    weworkremotely: weWorkRemotelyAdapter(baseUrl),
    justjoinit: justJoinItAdapter(baseUrl),
    nofluffjobs: noFluffJobsAdapter(baseUrl),
    bulldogjob: bulldogjobAdapter(baseUrl),
    pracuj: importedAdapter("pracuj", importsDir),
    theprotocol: importedAdapter("theprotocol", importsDir),
    djinni: djinniAdapter(baseUrl),
    dou: douAdapter(baseUrl),
    remoteok: remoteOkAdapter(baseUrl),
    workingnomads: workingNomadsAdapter(baseUrl),
  };
}
