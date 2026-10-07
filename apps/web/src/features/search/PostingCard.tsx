import { SOURCE_NAMES } from "../../api/collector";
import type { Listing, Posting } from "../../api/search";
import { Badge } from "../../components/Badge";
import { ago, shortDate } from "../../lib/time";

// Source text is untrusted: rendered only as React text, never as markup (AC-09).
const sourceName = (id: string) =>
  (SOURCE_NAMES as Record<string, { name: string } | undefined>)[id]?.name ?? id;

function Time({ posting, now }: { posting: Posting; now: number }) {
  const at = posting.published_at;
  if (at === null) {
    return (
      <p className="text-sm text-text-muted">
        Publication time unknown · first seen {shortDate(posting.first_seen_at)}
      </p>
    );
  }
  return (
    <time dateTime={at} title={new Date(at).toUTCString()} className="text-sm text-text-muted">
      Published {ago(at, now)}
    </time>
  );
}

function Source({ listing }: { listing: Listing }) {
  const name = sourceName(listing.source_id);
  const where = ` — ${listing.location_restriction ?? "unknown"}`;
  if (listing.status === "closed") {
    return (
      <li className="py-1">
        {name}
        {where} <span className="text-text-muted">closed at {name}</span>
      </li>
    );
  }
  if (listing.url === null) {
    return (
      <li className="py-1">
        {name}
        {where}
      </li>
    );
  }
  return (
    <li>
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 min-w-11 items-center text-accent underline"
      >
        {name}
      </a>
      {where}
    </li>
  );
}

/** SCR-01 posting (screens.md NEW: PostingCard). Only the source names are links. Phones stack the
 * parts in wireframe order; from md: time and sources move to a second column. */
export function PostingCard({ posting, now = Date.now() }: { posting: Posting; now?: number }) {
  return (
    <article className="grid gap-1 break-words rounded-card border border-border p-3 md:grid-cols-[minmax(0,1fr)_16rem] md:gap-x-4">
      <div className="flex min-w-0 items-start justify-between gap-2 md:col-start-1">
        <h3 className="min-w-0 font-medium">{posting.title}</h3>
        {posting.is_new && <Badge tone="new">New</Badge>}
      </div>
      <p className="text-text-muted md:col-start-1">{posting.company}</p>
      <div className="md:col-start-2 md:row-start-1">
        <Time posting={posting} now={now} />
      </div>
      {posting.matched_skills.length > 0 && (
        <ul className="flex flex-wrap gap-1 md:col-start-1">
          {posting.matched_skills.map((m) => (
            <li key={m.skill} data-skill>
              <Badge tone="notice">{m.in_title ? `${m.skill} · title` : m.skill}</Badge>
            </li>
          ))}
        </ul>
      )}
      <ul className="min-w-0 text-sm md:col-start-2 md:row-span-2 md:row-start-2">
        {posting.listings.map((l, i) => (
          // A posting's listings have no id in the contract; their order is stable.
          // biome-ignore lint/suspicious/noArrayIndexKey: stable order, no id
          <Source key={i} listing={l} />
        ))}
      </ul>
    </article>
  );
}
