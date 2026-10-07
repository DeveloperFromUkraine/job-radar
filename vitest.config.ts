import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["apps/web", "apps/server", "apps/server/vitest.perf.config.ts"],
  },
});
