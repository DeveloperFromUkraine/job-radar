// Postings + listings: applying the merge decision (ADR-0005, sad §6 Flow 6) inside the ingest
// transaction. The decision itself is the pure domain rule in domain/merge.ts.
import { and, eq, gte, inArray, lt, max, min, or } from "drizzle-orm";
import { newId } from "../../../../core/id.js";
import type { NormalizedListing } from "../../domain/adapter.js";
import type { ClosureListing } from "../../domain/closures.js";
import {
  type Candidate,
  decideMerge,
  earliestPublishedAt,
  matchKey,
  type Presence,
} from "../../domain/merge.js";
import type { SourceId } from "../../domain/sources.js";
import { listings, postings } from "../schema.js";
import type { DbOrTx } from "./tx.js";

/** Id lists are bound in chunks, far under SQLite's bound-variable limit (32766). */
const CHUNK = 500;
function* chunks<T>(items: readonly T[]): Generator<T[]> {
  for (let i = 0; i < items.length; i += CHUNK) yield items.slice(i, i + CHUNK);
}

export type ListingEffect = "added" | "updated" | "unchanged";

export interface ApplyContext {
  runId: string;
  now: number;
  isFirstFill: boolean;
  /** What this fetch proves about the source's items (AC-04 re-post rule, review R1). */
  presence: Presence;
}

/** Stores one normalized listing and merges it; returns its effect on postings and whether the item is new. */
export function applyListing(
  db: DbOrTx,
  listing: NormalizedListing,
  ctx: ApplyContext,
): { effect: ListingEffect; newItem: boolean } {
  const known = db
    .select({ listing: listings, postingStatus: postings.status })
    .from(listings)
    .innerJoin(postings, eq(listings.postingId, postings.id))
    .where(and(eq(listings.sourceId, listing.sourceId), eq(listings.sourceItemId, listing.sourceItemId)))
    .get();

  const key = matchKey(listing.company, listing.title);
  const decision = decideMerge(
    listing,
    known
      ? {
          listingId: known.listing.id,
          postingId: known.listing.postingId,
          postingStatus: known.postingStatus,
        }
      : null,
    known ? [] : candidatesFor(db, key),
    ctx.presence,
  );
  const fields = {
    url: listing.url,
    title: listing.title,
    company: listing.company,
    description: listing.description,
    locationRestriction: listing.locationRestriction,
    categories: JSON.stringify(listing.categories),
    publishedAt: listing.publishedAt,
    expiresAt: listing.expiresAt,
    lastSeenAt: ctx.now,
    lastSeenRunId: ctx.runId,
    status: "open" as const,
    closedAt: null,
  };

  if (decision.kind === "create") {
    const postingId = newId();
    db.insert(postings)
      .values({
        id: postingId,
        matchKey: key,
        title: listing.title,
        company: listing.company,
        publishedAt: listing.publishedAt,
        firstFoundAt: ctx.now,
        status: "open",
        lastOfferedAt: ctx.now,
      })
      .run();
    insertListing(db, listing, postingId, fields, ctx);
    return { effect: "added", newItem: true };
  }

  const posting = db.select().from(postings).where(eq(postings.id, decision.postingId)).get();
  if (!posting) throw new Error(`posting ${decision.postingId} vanished`);
  let changed = decision.reopen;

  if (decision.kind === "update-known" && known) {
    const before = known.listing;
    changed ||=
      before.status === "closed" ||
      before.title !== listing.title ||
      before.description !== listing.description ||
      before.locationRestriction !== listing.locationRestriction ||
      before.url !== listing.url;
    db.update(listings).set(fields).where(eq(listings.id, before.id)).run();
  } else {
    if (decision.kind === "replace-same-source") {
      // The new item replaces the old one at that source; not a closure (AC-04).
      db.delete(listings).where(eq(listings.id, decision.replacesListingId)).run();
    }
    insertListing(db, listing, posting.id, fields, ctx);
    changed = true;
  }

  // The posting keeps its id, title, company and first-found time; marks live elsewhere (AC-06).
  db.update(postings)
    .set({
      publishedAt: earliestPublishedAt(posting.publishedAt, listing.publishedAt),
      lastOfferedAt: ctx.now,
      ...(decision.reopen ? { status: "open" as const, closedAt: null } : {}),
    })
    .where(eq(postings.id, posting.id))
    .run();
  return { effect: changed ? "updated" : "unchanged", newItem: decision.kind !== "update-known" };
}

function insertListing(
  db: DbOrTx,
  listing: NormalizedListing,
  postingId: string,
  fields: Omit<
    typeof listings.$inferInsert,
    "id" | "postingId" | "sourceId" | "sourceItemId" | "firstCollectedAt" | "isFirstFill"
  >,
  ctx: ApplyContext,
): void {
  db.insert(listings)
    .values({
      id: newId(),
      postingId,
      sourceId: listing.sourceId,
      sourceItemId: listing.sourceItemId,
      firstCollectedAt: ctx.now,
      isFirstFill: ctx.isFirstFill,
      ...fields,
    })
    .run();
}

/** Not-removed postings with this match key, with their listings and latest publication time. */
function candidatesFor(db: DbOrTx, key: string): Candidate[] {
  const found = db.select().from(postings).where(eq(postings.matchKey, key)).all();
  if (found.length === 0) return [];
  const ids = found.map((p) => p.id);
  const all = db.select().from(listings).where(inArray(listings.postingId, ids)).all();
  const latest = db
    .select({ postingId: listings.postingId, latest: max(listings.publishedAt) })
    .from(listings)
    .where(inArray(listings.postingId, ids))
    .groupBy(listings.postingId)
    .all();
  return found.map((p) => ({
    postingId: p.id,
    status: p.status,
    latestPublishedAt: latest.find((l) => l.postingId === p.id)?.latest ?? null,
    listings: all
      .filter((l) => l.postingId === p.id)
      .map((l) => ({
        listingId: l.id,
        sourceId: l.sourceId as Candidate["listings"][number]["sourceId"],
        sourceItemId: l.sourceItemId,
        locationRestriction: l.locationRestriction,
        lastSeenRunId: l.lastSeenRunId,
        publishedAt: l.publishedAt,
        expiresAt: l.expiresAt,
        status: l.status,
      })),
  }));
}

/** Open postings that have an open listing from any of these sources, with all of their listings. */
export function openPostingsTouching(
  db: DbOrTx,
  sourceIds: readonly SourceId[],
): { postingId: string; listings: ClosureListing[] }[] {
  if (sourceIds.length === 0) return [];
  // One subquery instead of an id list: no bound parameter per posting (SQLite's 32766 limit).
  const touched = db
    .selectDistinct({ id: listings.postingId })
    .from(listings)
    .innerJoin(postings, eq(listings.postingId, postings.id))
    .where(
      and(
        inArray(listings.sourceId, [...sourceIds]),
        eq(listings.status, "open"),
        eq(postings.status, "open"),
      ),
    );
  const byPosting = new Map<string, ClosureListing[]>();
  for (const l of db.select().from(listings).where(inArray(listings.postingId, touched)).all()) {
    const list = byPosting.get(l.postingId) ?? [];
    list.push({
      listingId: l.id,
      sourceId: l.sourceId as SourceId,
      status: l.status,
      publishedAt: l.publishedAt,
      expiresAt: l.expiresAt,
      lastSeenRunId: l.lastSeenRunId,
    });
    byPosting.set(l.postingId, list);
  }
  return [...byPosting].map(([postingId, list]) => ({ postingId, listings: list }));
}

export function closeListings(db: DbOrTx, ids: readonly string[], at: number): void {
  for (const chunk of chunks(ids)) {
    db.update(listings).set({ status: "closed", closedAt: at }).where(inArray(listings.id, chunk)).run();
  }
}

/** Closed postings stay with their marks (AC-07); only retention removes them. */
export function closePostings(db: DbOrTx, ids: readonly string[], at: number): void {
  for (const chunk of chunks(ids)) {
    db.update(postings).set({ status: "closed", closedAt: at }).where(inArray(postings.id, chunk)).run();
  }
}

/** Category names of this source's listings seen since `since` (AC-24 for sources without a list). */
export function categoriesSeenSince(db: DbOrTx, sourceId: SourceId, since: number): string[] {
  const seen = new Set<string>();
  for (const row of db
    .select({ categories: listings.categories })
    .from(listings)
    .where(and(eq(listings.sourceId, sourceId), gte(listings.lastSeenAt, since)))
    .all()) {
    for (const c of JSON.parse(row.categories) as string[]) seen.add(c);
  }
  return [...seen];
}

/**
 * Postings that may be past retention: closed more than 60 days ago, or open and last offered more
 * than 60 days ago. A superset — disabled-only days only make a posting younger (AC-10, AC-26).
 */
export function retentionCandidates(db: DbOrTx, cutoff: number) {
  const found = db
    .select({
      id: postings.id,
      status: postings.status,
      closedAt: postings.closedAt,
      lastOfferedAt: postings.lastOfferedAt,
    })
    .from(postings)
    .where(
      or(
        and(eq(postings.status, "closed"), lt(postings.closedAt, cutoff)),
        and(eq(postings.status, "open"), lt(postings.lastOfferedAt, cutoff)),
      ),
    )
    .all();
  const sourcesOf = new Map<string, string[]>();
  for (const chunk of chunks(found.map((p) => p.id))) {
    for (const row of db
      .selectDistinct({ postingId: listings.postingId, sourceId: listings.sourceId })
      .from(listings)
      .where(inArray(listings.postingId, chunk))
      .all()) {
      sourcesOf.set(row.postingId, [...(sourcesOf.get(row.postingId) ?? []), row.sourceId]);
    }
  }
  return found.map((p) => ({ ...p, sourceIds: sourcesOf.get(p.id) ?? [] }));
}

/** Removes postings with their listings (cascade). */
export function removePostings(db: DbOrTx, ids: readonly string[]): void {
  for (const chunk of chunks(ids)) db.delete(postings).where(inArray(postings.id, chunk)).run();
}

/**
 * Known items the fetch returned but the category filter dropped: still offered by the source, so
 * they are seen in this run and never "absent" (AC-23, AC-07). Their offer time is not renewed —
 * postings outside the owner's categories age out as usual.
 */
export function markSeen(
  db: DbOrTx,
  sourceId: SourceId,
  sourceItemIds: readonly string[],
  ctx: { runId: string; now: number },
): void {
  for (let i = 0; i < sourceItemIds.length; i += 500) {
    db.update(listings)
      .set({ lastSeenAt: ctx.now, lastSeenRunId: ctx.runId })
      .where(
        and(eq(listings.sourceId, sourceId), inArray(listings.sourceItemId, sourceItemIds.slice(i, i + 500))),
      )
      .run();
  }
}

/** The oldest publication time among a source's listings — how far its first fill has reached. */
export function oldestPublishedAt(db: DbOrTx, sourceId: SourceId): number | null {
  return (
    db
      .select({ at: min(listings.publishedAt) })
      .from(listings)
      .where(eq(listings.sourceId, sourceId))
      .get()?.at ?? null
  );
}
