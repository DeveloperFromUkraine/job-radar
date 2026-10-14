// The collector's merge normalization, read-only, for other modules (applied-skipped ADR-0004): the
// look-alike rule starts from exactly the company and title matching the collector merges by.
export { normalizeCompany, normalizeTitle } from "../domain/merge.js";
