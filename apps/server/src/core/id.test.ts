import { describe, expect, it } from "vitest";
import { newId } from "./id.js";

describe("newId", () => {
  it("produces UUIDv7 strings", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("is time-sortable: ids created later sort after earlier ones", () => {
    const ids = Array.from({ length: 1000 }, () => newId());

    expect([...ids].sort()).toEqual(ids);
  });
});
