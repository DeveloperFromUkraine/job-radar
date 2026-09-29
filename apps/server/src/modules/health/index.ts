import type { FastifyPluginAsync } from "fastify";
import { healthRoutes } from "./ports/routes.js";

// Reference module: the shape every feature module copies.
export const healthModule: FastifyPluginAsync = async (app) => {
  await app.register(healthRoutes);
};
