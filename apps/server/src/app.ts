import Fastify, { type FastifyInstance } from "fastify";
import { registerAccessGuard } from "./core/access.js";
import { registerErrorHandling } from "./core/errors.js";
import { healthModule } from "./modules/health/index.js";

export interface BuildAppOptions {
  logger?: boolean;
  // The configured port; the Host check uses the real listening port once the server listens.
  port?: number;
}

// Composition root: every module is a Fastify plugin registered here.
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  registerErrorHandling(app);
  registerAccessGuard(app, options.port ?? 3000);

  await app.register(healthModule);

  return app;
}
