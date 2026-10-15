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

/** The machine's zone: clean-up's calendar day and tracking's grace day both count in it. */
export const machineTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
