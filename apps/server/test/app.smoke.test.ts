import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("server skeleton", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("boots on a real port and answers GET /health", async () => {
    app = await buildApp();
    const address = await app.listen({ host: "127.0.0.1", port: 0 });

    const res = await fetch(`${address}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
