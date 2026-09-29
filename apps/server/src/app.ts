import Fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandling } from "./core/errors.js";
import { healthModule } from "./modules/health/index.js";

export interface BuildAppOptions {
  logger?: boolean;
}

// Composition root: every module is a Fastify plugin registered here.
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  registerErrorHandling(app);

  await app.register(healthModule);

  return app;
}
