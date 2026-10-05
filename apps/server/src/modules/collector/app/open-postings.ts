// The collector's read-only export of open postings (search-postings ADR-0001): other modules read
// postings only through here, never through collector/infra.
export type { OpenListing, OpenPosting } from "../infra/repo/open-postings.js";
export {
  readOpenPostings as openPostings,
  readPostingsByIds as postingsByIds,
} from "../infra/repo/open-postings.js";
