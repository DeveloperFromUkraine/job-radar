import type { FastifyError, FastifyInstance } from "fastify";

export interface ErrorEnvelope {
  error: { code: string; message: string };
}

// Throw from any module; the handler below turns it into the envelope.
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function envelope(code: string, message: string): ErrorEnvelope {
  return { error: { code, message } };
}

// The single place that shapes error responses: { "error": { "code", "message" } }.
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(envelope("NOT_FOUND", `Route ${request.method} ${request.url} not found`));
  });

  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(envelope(err.code, err.message));
    }
    if (err.validation) {
      return reply.status(400).send(envelope("VALIDATION_ERROR", err.message));
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      request.log.error(err);
      return reply.status(status).send(envelope("INTERNAL", "Internal server error"));
    }
    return reply.status(status).send(envelope(err.code ?? "BAD_REQUEST", err.message));
  });
}
