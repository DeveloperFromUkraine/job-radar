import { buildApp } from "./app.js";
import { assertLoopbackHost } from "./core/access.js";
import { loadConfig } from "./core/config.js";

const config = loadConfig();
try {
  assertLoopbackHost(config.host);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const app = await buildApp({ logger: true, port: config.port });

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
