// Company job boards: each tracked company's public Greenhouse, Lever or Ashby board API (no key,
// made for showing a company's roles elsewhere; checked 2026-10-20). A run reads the boards due —
// read longest ago first, BOARDS_PER_RUN at most — keeping their remote roles, then lets the registry
// find new boards with the hour's remaining reads. Always `capped`: a listing closes by its expiry,
// which every read of its board moves on (ADR-0004, as Remote OK).
import type { FetchResult, RawListing } from "../../domain/adapter.js";
import { type Ats, type BoardRef, rolesOf } from "../../domain/ats.js";
import type { HttpResult, SourceHttp } from "../http.js";
import { type FetchContext, isObject, payText, type SourceAdapter } from "./types.js";

const DAY = 24 * 60 * 60 * 1000;
export const BOARDS_PER_RUN = 60;
/**
 * A role stays open this long after its board last listed it. ponytail: 7 days of reads cover ~10,000
 * boards at 60 an hour; past that, raise BOARDS_PER_RUN or this.
 */
const SEEN_FOR = 7 * DAY;

export interface TrackedBoard extends BoardRef {
  id: string;
  name: string;
}

/** The company list the source reads, kept by the collector's app layer (app/companies.ts). */
export interface CompanyRegistry {
  /** Finds new boards after a read; its probes go through the same counted HTTP. */
  discover(http: SourceHttp, now: number): Promise<void>;
  due(limit: number): TrackedBoard[];
  read(id: string, result: "ok" | "failed" | "not_found", openRoles: number | null, now: number): void;
}

const API: Record<Ats, string> = {
  greenhouse: "https://boards-api.greenhouse.io",
  lever: "https://api.lever.co",
  ashby: "https://api.ashbyhq.com",
};

export function boardApiUrl({ ats, slug }: BoardRef, baseUrl?: string): string {
  const base = baseUrl ?? API[ats];
  const s = encodeURIComponent(slug);
  if (ats === "greenhouse") return `${base}/v1/boards/${s}/jobs?content=true`;
  if (ats === "lever") return `${base}/v0/postings/${s}?mode=json`;
  return `${base}/posting-api/job-board/${s}?includeCompensation=true`;
}

export const isNotFound = (res: HttpResult): boolean =>
  res.kind === "failed" && res.failure.detail === "HTTP 404";

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&amp;": "&",
};
/** Greenhouse sends its HTML entity-escaped. */
const unescapeHtml = (s: string) => s.replace(/&(?:lt|gt|quot|#39|amp);/g, (e) => ENTITIES[e] ?? e);

const LEVER_PERIODS: Record<string, string> = {
  "per-year-salary": "year",
  "per-month-salary": "month",
  "per-week-salary": "week",
  "per-day-wage": "day",
  "per-hour-wage": "hour",
};

interface Job {
  id: string;
  url: string;
  title: string;
  company: string;
  description: string;
  location: string;
  remote: boolean;
  payField: string;
}

function greenhouseJobs(body: unknown, board: TrackedBoard): Job[] | null {
  if (!isObject(body) || !Array.isArray(body.jobs)) return null;
  return body.jobs.filter(isObject).map((j) => {
    const location = isObject(j.location) ? text(j.location.name) : "";
    return {
      id: String(j.id),
      url: text(j.absolute_url),
      title: text(j.title),
      company: text(j.company_name) || board.name,
      description: unescapeHtml(text(j.content)),
      location,
      remote: /remote/i.test(`${location} ${text(j.title)}`),
      payField: "",
    };
  });
}

function leverJobs(body: unknown, board: TrackedBoard): Job[] | null {
  if (!Array.isArray(body)) return null;
  return body.filter(isObject).map((j) => {
    const cats = isObject(j.categories) ? j.categories : {};
    const all = Array.isArray(cats.allLocations) ? cats.allLocations.map(text).filter(Boolean) : [];
    const sections = Array.isArray(j.lists)
      ? j.lists.filter(isObject).map((l) => `<h3>${text(l.text)}</h3><ul>${text(l.content)}</ul>`)
      : [];
    const pay = isObject(j.salaryRange) ? j.salaryRange : {};
    return {
      id: text(j.id),
      url: text(j.hostedUrl),
      title: text(j.text),
      company: board.name,
      description: [text(j.description), ...sections, text(j.additional)].join("\n"),
      location: all.length > 0 ? all.join(", ") : text(cats.location),
      remote: text(j.workplaceType) === "remote",
      payField: payText(pay.min, pay.max, pay.currency, LEVER_PERIODS[text(pay.interval)]),
    };
  });
}

function ashbyJobs(body: unknown, board: TrackedBoard): Job[] | null {
  if (!isObject(body) || !Array.isArray(body.jobs)) return null;
  return body.jobs
    .filter(isObject)
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const more = Array.isArray(j.secondaryLocations)
        ? j.secondaryLocations.filter(isObject).map((l) => text(l.location))
        : [];
      const pay = isObject(j.compensation) ? text(j.compensation.compensationTierSummary) : "";
      return {
        id: text(j.id),
        url: text(j.jobUrl),
        title: text(j.title),
        company: board.name,
        description: text(j.descriptionHtml),
        location: [text(j.location), ...more].filter(Boolean).join(", "),
        remote: j.isRemote === true || text(j.workplaceType) === "Remote",
        payField: pay,
      };
    });
}

const PARSERS: Record<Ats, (body: unknown, board: TrackedBoard) => Job[] | null> = {
  greenhouse: greenhouseJobs,
  lever: leverJobs,
  ashby: ashbyJobs,
};

/** A board's remote jobs as listings (the owner's roles are kept by the collector); null = not a board answer. */
export function boardListings(body: unknown, board: TrackedBoard, now: number): RawListing[] | null {
  const jobs = PARSERS[board.ats](body, board);
  if (jobs === null) return null;
  return jobs
    .filter((j) => j.remote && j.id && j.url && j.title)
    .map((j) => ({
      sourceItemId: `${board.ats}:${board.slug}:${j.id}`,
      url: j.url,
      title: j.title.trim(),
      company: j.company,
      description: j.description,
      locationRestriction: j.location || null,
      categories: rolesOf(j.title),
      // A board lists only roles still being filled, and evergreen ones keep their first date for
      // years (Linear's from 2021): no publication time, so a role counts from when it was found.
      publishedAt: null,
      expiresAt: now + SEEN_FOR,
      payField: j.payField,
    }));
}

export function atsAdapter(registry: CompanyRegistry | undefined, baseUrl?: string): SourceAdapter {
  return {
    id: "ats",
    async fetchLatest(ctx: FetchContext): Promise<FetchResult> {
      // One read marks the run, so the source keeps its interval even when no board is due yet.
      if (!ctx.http.countRead()) {
        return { completeness: "partial", listings: [], itemsReturned: null, coversPublishedAfter: null };
      }
      if (!registry) {
        return { completeness: "complete", listings: [], itemsReturned: 0, coversPublishedAfter: null };
      }
      const listings: RawListing[] = [];
      let itemsReturned = 0;
      let failed = 0;
      let limited = false;
      const boards = registry.due(BOARDS_PER_RUN);
      for (const board of boards) {
        const res = await ctx.http.getJson(boardApiUrl(board, baseUrl));
        if (res.kind === "limited") {
          limited = true;
          break;
        }
        if (isNotFound(res)) {
          registry.read(board.id, "not_found", null, ctx.now);
          continue;
        }
        const found = res.kind === "ok" ? boardListings(res.body, board, ctx.now) : null;
        if (found === null) {
          failed++;
          registry.read(board.id, "failed", null, ctx.now);
          continue;
        }
        itemsReturned += found.length;
        const tracked = found.filter((l) => l.categories.length > 0);
        registry.read(board.id, "ok", tracked.length, ctx.now);
        listings.push(...found);
      }
      // What is left of the hour's reads finds new boards; they are read from the next run on.
      if (!limited) await registry.discover(ctx.http, ctx.now);
      if (boards.length > 0 && failed === boards.length) {
        return {
          completeness: "failed",
          listings: [],
          itemsReturned: 0,
          coversPublishedAfter: null,
          failure: { code: "unreachable", detail: "no company board answered" },
        };
      }
      return {
        // A read cut short by the request window is no evidence: nothing expires on it.
        completeness: limited ? "partial" : "capped",
        listings,
        itemsReturned,
        coversPublishedAfter: null,
      };
    },
  };
}
