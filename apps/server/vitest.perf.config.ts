import { defineProject } from "vitest/config";
import { PERF_TESTS } from "./vitest.config.js";

export default defineProject({
  test: {
    name: "server-perf",
    environment: "node",
    include: PERF_TESTS,
    sequence: { groupOrder: 1 }, // after the server and web projects (group 0) finish
  },
});
