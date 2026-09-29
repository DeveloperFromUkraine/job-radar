import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/core/schema.ts", "./src/modules/*/infra/schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_FILE ?? "data/job-radar.sqlite",
  },
});
