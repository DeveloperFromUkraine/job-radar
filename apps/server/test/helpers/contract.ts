import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

// Validates a response body against the collector contract (contracts/openapi.yaml): the same
// shapes the web app is built against, so server and UI cannot drift apart silently.
const doc = parse(
  readFileSync(
    new URL("../../../../docs/features/remote-boards-collector/contracts/openapi.yaml", import.meta.url),
    "utf8",
  ),
);

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
ajv.addSchema({ $id: "openapi", components: doc.components });

type Operation = { operationId: string; responses: Record<string, unknown> };

function operation(operationId: string): Operation {
  for (const methods of Object.values(doc.paths as Record<string, Record<string, Operation>>)) {
    for (const op of Object.values(methods)) if (op.operationId === operationId) return op;
  }
  throw new Error(`no operation ${operationId} in the contract`);
}

function responseSchemaRef(operationId: string, status: number): string {
  let response = operation(operationId).responses[String(status)] as Record<string, unknown> | undefined;
  if (!response) throw new Error(`${operationId} declares no ${status} response`);
  if (typeof response.$ref === "string") {
    const name = response.$ref.split("/").at(-1) as string;
    response = doc.components.responses[name];
  }
  const content = response?.content as Record<string, { schema: { $ref: string } }> | undefined;
  const schema = content?.["application/json"]?.schema;
  if (!schema?.$ref) throw new Error(`${operationId} ${status} has no JSON schema ref`);
  return `openapi${schema.$ref}`;
}

/** Throws with every violation when `body` does not match the contract for that response. */
export function expectContract(operationId: string, status: number, body: unknown): void {
  const validate = ajv.getSchema(responseSchemaRef(operationId, status));
  if (!validate) throw new Error(`schema not found for ${operationId} ${status}`);
  if (!validate(body)) {
    throw new Error(
      `${operationId} ${status} breaks the contract: ${ajv.errorsText(validate.errors, { separator: "\n" })}`,
    );
  }
}

/** A named example from the contract — the web tests use the same bodies as mocks. */
export function contractExample(operationId: string, status: number, name?: string): unknown {
  const content = (
    operation(operationId).responses[String(status)] as { content: Record<string, Record<string, unknown>> }
  ).content["application/json"];
  if (!content) throw new Error(`${operationId} ${status} has no JSON content`);
  if (name) return (content.examples as Record<string, { value: unknown }>)[name]?.value;
  return content.example;
}
