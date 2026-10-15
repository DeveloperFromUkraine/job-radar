// Typed client for the tracking API (docs/features/applied-skipped/contracts/openapi.yaml).
import { post } from "./collector";
import type { Mark, MarkState } from "./search";

const marks = (postingId: string) => `/api/v1/tracking/marks/${encodeURIComponent(postingId)}`;

/** Marks, changes, or (with null) clears a posting's mark. */
export const setMark = (postingId: string, mark: Mark | null) => post<MarkState>(marks(postingId), { mark });
/** Reverses the change `changeId` made; 409 when the mark changed elsewhere since (AC-04). */
export const undoMark = (postingId: string, changeId: string) =>
  post<MarkState>(`${marks(postingId)}/undo`, { change_id: changeId });
