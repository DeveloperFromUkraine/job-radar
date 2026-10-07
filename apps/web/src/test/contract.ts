import { parse } from "yaml";
import openapi from "../../../../docs/features/remote-boards-collector/contracts/openapi.yaml?raw";

// Mocks come from the contract's own examples — the same bodies the server's responses are
// validated against, so the screens are tested on shapes the API really returns.
type Content = { example?: unknown; examples?: Record<string, { value: unknown }> };
const doc = parse(openapi) as {
  paths: Record<
    string,
    Record<string, { operationId: string; responses: Record<string, { content?: Record<string, Content> }> }>
  >;
};

export function contractExample<T = unknown>(operationId: string, status: number, name?: string): T {
  for (const methods of Object.values(doc.paths)) {
    for (const op of Object.values(methods)) {
      if (op.operationId !== operationId) continue;
      const content = op.responses[String(status)]?.content?.["application/json"];
      const value = name ? content?.examples?.[name]?.value : content?.example;
      if (value === undefined) throw new Error(`no example ${operationId} ${status} ${name ?? ""}`);
      return structuredClone(value) as T;
    }
  }
  throw new Error(`no operation ${operationId}`);
}
