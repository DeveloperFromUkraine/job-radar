// The owner's settings file (sad.md §5): enabled flag + tech categories per source.
// A file that names an unknown source or breaks any rule is unreadable as a whole (AC-27).
import { hasZeroRate, SOURCES, type SourceDefinition, type SourceId } from "./sources.js";

export interface SourceSettings {
  enabled: boolean;
  categories: string[];
}

export interface Settings {
  sources: Record<SourceId, SourceSettings>;
}

export type SourceState = "enabled" | "disabled" | "not_verified";

export type ParseResult = { ok: true; settings: Settings } | { ok: false; reason: string };

// Default tech categories, named exactly as each source publishes them (checked 2026-10-02):
// Jobicy — GET /api/v2/remote-jobs?get=industries; Remotive — GET /api/remote-jobs/categories;
// Himalayas publishes no category list — these are its job `parentCategories` values;
// We Work Remotely — none until spec §8 Q1 is answered (the source stays disabled).
export const DEFAULT_SETTINGS: Settings = {
  sources: {
    jobicy: {
      enabled: true,
      categories: [
        "Software Engineering",
        "DevOps & Infrastructure",
        "Data Science & Analytics",
        "QA & Testing",
        "Cybersecurity",
      ],
    },
    himalayas: { enabled: true, categories: ["Developer", "Data Science"] },
    remotive: {
      enabled: true,
      categories: [
        "Software Development",
        "Devops",
        "Data and Analytics",
        "Quality Assurance",
        "Artificial Intelligence",
      ],
    },
    weworkremotely: {
      enabled: true,
      categories: [
        "Back-End Programming",
        "Front-End Programming",
        "Full-Stack Programming",
        "DevOps and Sysadmin",
      ],
    },
  },
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function parseSettings(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "The settings file is not valid JSON." };
  }
  if (!isObject(raw) || !isObject(raw.sources)) {
    return { ok: false, reason: 'The settings file needs a "sources" object.' };
  }

  const known = new Set<string>(SOURCES.map((s) => s.id));
  const sources = { ...DEFAULT_SETTINGS.sources };
  for (const [id, entry] of Object.entries(raw.sources)) {
    if (!known.has(id)) return { ok: false, reason: `The settings file names an unknown source "${id}".` };
    if (!isObject(entry)) return { ok: false, reason: `Source "${id}" must be an object.` };
    for (const key of Object.keys(entry)) {
      if (key !== "enabled" && key !== "categories") {
        return { ok: false, reason: `Source "${id}" has an unexpected key "${key}".` };
      }
    }
    if (typeof entry.enabled !== "boolean") {
      return { ok: false, reason: `Source "${id}": "enabled" must be true or false.` };
    }
    const { categories } = entry;
    if (!Array.isArray(categories) || !categories.every((c) => typeof c === "string" && c.trim() !== "")) {
      return { ok: false, reason: `Source "${id}": "categories" must be a list of category names.` };
    }
    sources[id as SourceId] = { enabled: entry.enabled, categories: categories as string[] };
  }
  return { ok: true, settings: { sources } };
}

export function sourceState(settings: Settings, source: SourceDefinition): SourceState {
  if (!settings.sources[source.id].enabled) return "disabled";
  return hasZeroRate(source) ? "not_verified" : "enabled";
}
