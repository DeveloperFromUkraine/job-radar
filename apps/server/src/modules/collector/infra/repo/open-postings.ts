// Read-only: open postings with their listings, for other modules through app/open-postings.ts.
// Text (title, description) only for open listings; a closed listing is named by source + status.
import { and, asc, eq, gt, inArray, type SQL } from "drizzle-orm";
import type { Db } from "../../../../core/db.js";
import { listings, postings } from "../schema.js";

export interface OpenListing {
  sourceId: string;
  status: "open" | "closed";
  url: string;
  locationRestriction: string | null;
  title?: string;
  description?: string;
}

export interface OpenPosting {
  id: string;
  title: string;
  company: string;
  publishedAt: number | null;
  firstFoundAt: number;
  listings: OpenListing[];
}

const CHUNK = 500; // far under SQLite's bound-variable limit

function read(db: Db, where?: SQL): OpenPosting[] {
  const filter = and(eq(postings.status, "open"), where);
  const byId = new Map<string, OpenPosting>();
  for (const p of db
    .select({
      id: postings.id,
      title: postings.title,
      company: postings.company,
      publishedAt: postings.publishedAt,
      firstFoundAt: postings.firstFoundAt,
    })
    .from(postings)
    .where(filter)
    .orderBy(asc(postings.id))
    .all())
    byId.set(p.id, { ...p, listings: [] });

  const rows = db
    .select({
      postingId: listings.postingId,
      sourceId: listings.sourceId,
      status: listings.status,
      url: listings.url,
      locationRestriction: listings.locationRestriction,
      title: listings.title,
      description: listings.description,
    })
    .from(listings)
    .innerJoin(postings, eq(listings.postingId, postings.id))
    .where(filter)
    .orderBy(asc(listings.id))
    .all();
  for (const { postingId, title, description, ...listing } of rows)
    byId
      .get(postingId)
      ?.listings.push(listing.status === "open" ? { ...listing, title, description } : listing);
  return [...byId.values()];
}

/** Every open posting, or only those first collected after `foundAfter`. */
export function readOpenPostings(db: Db, opts: { foundAfter?: number } = {}): OpenPosting[] {
  return read(db, opts.foundAfter === undefined ? undefined : gt(postings.firstFoundAt, opts.foundAfter));
}

/** The current state of the given postings; closed or removed ones are left out. */
export function readPostingsByIds(db: Db, ids: readonly string[]): OpenPosting[] {
  const result: OpenPosting[] = [];
  for (let i = 0; i < ids.length; i += CHUNK)
    result.push(...read(db, inArray(postings.id, ids.slice(i, i + CHUNK))));
  return result;
}
