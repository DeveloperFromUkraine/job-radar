import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { AppError, registerErrorHandling } from "./errors.js";

describe("error envelope", () => {
  it("returns the envelope for an unknown route", async () => {
    const app = await buildApp();

    const res = await app.inject({ method: "GET", url: "/nope" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Route GET /nope not found" } });
    await app.close();
  });

  it("maps AppError to its status and code", async () => {
    const app = Fastify();
    registerErrorHandling(app);
    app.get("/boom", async () => {
      throw new AppError("POSTING_GONE", "Posting was removed", 410);
    });

    const res = await app.inject({ method: "GET", url: "/boom" });

    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: { code: "POSTING_GONE", message: "Posting was removed" } });
  });

  it("hides unexpected errors behind INTERNAL", async () => {
    const app = Fastify();
    registerErrorHandling(app);
    app.get("/crash", async () => {
      throw new Error("db exploded");
    });

    const res = await app.inject({ method: "GET", url: "/crash" });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: "INTERNAL", message: "Internal server error" } });
  });
});
