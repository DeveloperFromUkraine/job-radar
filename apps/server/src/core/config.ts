export interface Config {
  host: string;
  port: number;
  databaseFile: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 3000),
    databaseFile: env.DATABASE_FILE ?? "data/job-radar.sqlite",
  };
}
