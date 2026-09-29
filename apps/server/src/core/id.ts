import { v7 as uuidv7 } from "uuid";

// UUIDv7: time-ordered, so sorting by id == sorting by creation time (ADR 0003).
export function newId(): string {
  return uuidv7();
}
