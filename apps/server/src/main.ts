import { buildApp } from "./app.js";
import { loadConfig } from "./core/config.js";

const config = loadConfig();
const app = await buildApp({ logger: true });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
