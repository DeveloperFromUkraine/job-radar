import { parse } from "yaml";
import appliedSkippedApi from "../../../../docs/features/applied-skipped/contracts/openapi.yaml?raw";
import collectorApi from "../../../../docs/features/remote-boards-collector/contracts/openapi.yaml?raw";
import remoteFilterApi from "../../../../docs/features/remote-filter/contracts/openapi.yaml?raw";
import searchApi from "../../../../docs/features/search-postings/contracts/openapi.yaml?raw";

// Mocks come from the contracts' own examples — the same bodies the server's responses are
// validated against, so the screens are tested on shapes the API really returns. Operation ids are
// unique across the feature contracts, except that runSearch, getNextPage and getWaitingCount are
// restated by applied-skipped and then remote-filter (the current shape). The older contracts are
// searched first, and an example they lack (found_with_hint, filtered, all_hidden, look) falls through;
// a main-list example from them is brought to the current shape with the values the server sends when no
// country is chosen.
type Content = { example?: unknown; examples?: Record<string, { value: unknown }> };
type Response = { $ref?: string; content?: Record<string, Content> };
type Doc = {
  paths: Record<string, Record<string, { operationId: string; responses: Record<string, Response> }>>;
  components?: { responses?: Record<string, Response> };
};
const docs = [collectorApi, searchApi, appliedSkippedApi, remoteFilterApi].map((raw) => parse(raw) as Doc);
const RESTATED = new Set(["runSearch", "getNextPage"]);

type Item = Record<string, unknown>;
/** An older main-list example as remote-filter returns it with no country chosen (mode none). */
function currentShape(operationId: string, status: number, value: unknown): unknown {
  if (!RESTATED.has(operationId) || status !== 200) return value;
  const page = value as { items: Item[] } & Item;
  const items = page.items.map((p) => ({ location_check: null, ...p }));
  if (operationId === "getNextPage") return { ...page, items };
  return { hidden_count: 0, location_filter: { mode: "none", country: null }, ...page, items };
}

export function contractExample<T = unknown>(operationId: string, status: number, name?: string): T {
  for (const doc of docs) {
    for (const methods of Object.values(doc.paths)) {
      for (const op of Object.values(methods)) {
        if (op.operationId !== operationId) continue;
        let response = op.responses[String(status)];
        // A shared response (`$ref: "#/components/responses/X"`) carries its example there.
        if (response?.$ref) response = doc.components?.responses?.[response.$ref.split("/").at(-1) as string];
        const content = response?.content?.["application/json"];
        const value = name ? content?.examples?.[name]?.value : content?.example;
        if (value !== undefined) return structuredClone(currentShape(operationId, status, value)) as T;
      }
    }
  }
  throw new Error(`no example ${operationId} ${status} ${name ?? ""}`);
}
