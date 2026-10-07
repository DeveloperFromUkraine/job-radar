import { configDefaults, defineProject } from "vitest/config";

// The latency NFR test runs in its own project (vitest.perf.config.ts), after every other test file,
// so parallel files can't inflate its timings.
export const PERF_TESTS = ["test/search-nfr.integration.test.ts"];

export default defineProject({
  test: {
    name: "server",
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...PERF_TESTS],
  },
});
