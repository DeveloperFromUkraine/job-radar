// The companies the "ats" source reads (infra/sources/ats.ts): found by itself — boards linked from
// collected listings, board names guessed from the collected postings' companies, companies TheirStack
// says are hiring — or added by the owner from a board link or a company's site.
import { ATS_LIST, type BoardRef, findBoards, slugGuesses } from "../domain/ats.js";
import { sourceById } from "../domain/sources.js";
import { createSourceHttp, type SourceHttp } from "../infra/http.js";
import {
  addBoard,
  addNotFound,
  type CompanyRow,
  dueBoards,
  findBoard,
  listCompanies,
  listingsLinkingBoards,
  readCompany,
  recordBoardRead,
  setCompanyStatus,
  unprobedCompanies,
} from "../infra/repo/companies.js";
import { readState, updateState } from "../infra/repo/state.js";
import { boardApiUrl, boardListings, type CompanyRegistry, isNotFound } from "../infra/sources/ats.js";
import { searchHiring } from "../infra/theirstack.js";
import type { CollectorDeps } from "./deps.js";

const DAY = 24 * 60 * 60 * 1000;
/** Names probed a run at most (2 guesses × 3 systems each); the hour's read limit usually ends it first. */
const PROBES_PER_RUN = 15;

export interface CompaniesOptions {
  /** Points every board API at a fake server (tests). */
  baseUrl?: string;
  theirstackKey?: string;
  theirstackEndpoint?: string;
}

type Probe = BoardRef | null | "stopped";

/** Whether a board answers as a board: a 404 is no board, any other failure stops the probing. */
async function checkBoard(http: SourceHttp, board: BoardRef, baseUrl?: string): Promise<boolean | "stopped"> {
  const res = await http.getJson(boardApiUrl(board, baseUrl));
  if (isNotFound(res)) return false;
  if (res.kind !== "ok") return "stopped";
  return boardListings(res.body, { ...board, id: "", name: "" }, 0) !== null;
}

async function probe(http: SourceHttp, guesses: readonly string[], baseUrl?: string): Promise<Probe> {
  for (const slug of guesses) {
    for (const ats of ATS_LIST) {
      const found = await checkBoard(http, { ats, slug }, baseUrl);
      if (found === "stopped") return "stopped";
      if (found) return { ats, slug };
    }
  }
  return null;
}

export function createCompanyRegistry(
  deps: Pick<CollectorDeps, "db">,
  options: CompaniesOptions = {},
): CompanyRegistry {
  const { db } = deps;
  return {
    async discover(http, now) {
      for (const { company, text } of listingsLinkingBoards(db)) {
        for (const board of findBoards(text))
          if (!findBoard(db, board)) addBoard(db, board, company, "link", now);
      }

      const lastSearch = readState(db).theirstackReadAt;
      if (options.theirstackKey && (lastSearch === null || now - lastSearch >= DAY)) {
        updateState(db, { theirstackReadAt: now }); // first, so a failing search is not repeated every run
        for (const job of await searchHiring(options.theirstackKey, options.theirstackEndpoint)) {
          for (const board of findBoards(job.links)) {
            if (!findBoard(db, board)) addBoard(db, board, job.company || board.slug, "theirstack", now);
          }
        }
      }

      for (const name of unprobedCompanies(db, PROBES_PER_RUN)) {
        const found = await probe(http, slugGuesses(name), options.baseUrl);
        if (found === "stopped") return; // the window is used up or a system is down: try again later
        if (found === null) addNotFound(db, name, now);
        else if (!findBoard(db, found)) addBoard(db, found, name, "probe", now);
      }
    },
    due: (limit) =>
      dueBoards(db, limit).map((c) => ({
        id: c.id,
        ats: c.ats as BoardRef["ats"],
        slug: c.slug as string,
        name: c.name,
      })),
    read: (id, result, openRoles, now) => recordBoardRead(db, id, result, openRoles, now),
  };
}

export type AddCompanyResult =
  | { kind: "added"; company: CompanyRow }
  | { kind: "exists"; company: CompanyRow }
  | { kind: "invalid" }
  | { kind: "not_found" }
  | { kind: "unavailable" };

const titleCase = (slug: string) => slug.replace(/[-_.]+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** The site a person typed: https only, a public host name (never an address or a local name). */
function siteOf(input: string): URL | null {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(input) ? input : `https://${input}`);
    const host = url.hostname;
    if (
      url.protocol !== "https:" ||
      !host.includes(".") ||
      /^[\d.]+$|^\[|localhost$|\.local$|\.internal$/i.test(host)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/** The owner adds a company by a board link (jobs.ashbyhq.com/linear) or by its site (linear.app). */
export async function addCompany(
  deps: Pick<CollectorDeps, "db" | "now" | "signal">,
  input: string,
  options: CompaniesOptions & { http?: SourceHttp } = {},
): Promise<AddCompanyResult> {
  const { db } = deps;
  const now = deps.now();
  const http =
    options.http ?? createSourceHttp(db, sourceById("ats"), { now: deps.now, signal: deps.signal });
  const keep = (board: BoardRef, name: string): AddCompanyResult => {
    const known = findBoard(db, board);
    if (known?.status === "active") return { kind: "exists", company: known };
    if (known) {
      setCompanyStatus(db, known.id, "active"); // the owner's choice wins over a removal or a 404
      return { kind: "added", company: readCompany(db, known.id) as CompanyRow };
    }
    return { kind: "added", company: addBoard(db, board, name, "manual", now) };
  };

  const linked = findBoards(input.trim())[0];
  if (linked) {
    const ok = await checkBoard(http, linked, options.baseUrl);
    if (ok === "stopped") return { kind: "unavailable" };
    return ok ? keep(linked, titleCase(linked.slug)) : { kind: "not_found" };
  }

  const site = siteOf(input.trim());
  if (!site) return { kind: "invalid" };
  const label = site.hostname.replace(/^(www|careers|jobs)\./, "").split(".")[0] ?? "";
  const pages = [site.origin, `${site.origin}/careers`, `${site.origin}/jobs`];
  for (const page of pages) {
    const res = await http.getText(page);
    if (res.kind === "limited") return { kind: "unavailable" };
    const board = res.kind === "ok" ? findBoards(String(res.body))[0] : undefined;
    if (board) return keep(board, titleCase(label));
  }
  const found = await probe(http, slugGuesses(label), options.baseUrl);
  if (found === "stopped") return { kind: "unavailable" };
  return found ? keep(found, titleCase(label)) : { kind: "not_found" };
}

export function companiesList(deps: Pick<CollectorDeps, "db">): CompanyRow[] {
  return listCompanies(deps.db);
}

/** Off the list for good: discovery never adds it back; adding it by hand does. */
export function removeCompany(deps: Pick<CollectorDeps, "db">, id: string): boolean {
  const row = readCompany(deps.db, id);
  if (row?.status !== "active") return false;
  setCompanyStatus(deps.db, id, "removed");
  return true;
}
