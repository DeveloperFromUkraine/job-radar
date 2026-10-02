// ADR-0007: no accounts. The server listens on loopback only, accepts only loopback Host headers
// (DNS rebinding), and takes state-changing requests only same-origin with a JSON body (CSRF).
// No CORS headers are ever sent.
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";

const LOOPBACK_BIND = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertLoopbackHost(host: string): void {
  if (!LOOPBACK_BIND.has(host)) {
    throw new Error(
      `job-radar listens on loopback only (127.0.0.1, localhost, ::1); refusing to bind "${host}"`,
    );
  }
}

export function registerAccessGuard(app: FastifyInstance, configuredPort: number): void {
  app.addHook("onRequest", async (request) => {
    const address = app.server.address();
    const port = address && typeof address === "object" ? address.port : configuredPort;
    const host = request.headers.host ?? "";
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      throw new AppError("FORBIDDEN_HOST", "Requests are accepted only for 127.0.0.1 or localhost.", 403);
    }

    if (SAFE_METHODS.has(request.method)) return;
    if (request.headers["sec-fetch-site"] === "cross-site") {
      throw new AppError("CROSS_SITE_REQUEST", "Cross-site requests are not accepted.", 403);
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json.", 415);
    }
  });
}
