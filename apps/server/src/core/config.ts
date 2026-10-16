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

/** Matching's provider settings (match-score sad.md §7), read once at start. */
export interface MatchingConfig {
  /** Only from ANTHROPIC_API_KEY; never stored, shown or logged (sad.md §8). null = no key set up. */
  apiKey: string | null;
  model: string;
  /** Dollars per million tokens; job-radar's own spend count uses these (ADR-0006). */
  price: { input: number; output: number; cacheWrite: number; cacheRead: number };
  /** Output limits include adaptive thinking, which cannot be turned off on Opus 5.5. */
  scoreOutputLimit: number;
  draftOutputLimit: number;
  scoreTimeoutMs: number;
  draftTimeoutMs: number;
  concurrency: number;
}

const num = (v: string | undefined, fallback: number) => (v !== undefined && v !== "" ? Number(v) : fallback);

export function loadMatchingConfig(env: NodeJS.ProcessEnv = process.env): MatchingConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY ? env.ANTHROPIC_API_KEY : null,
    model: env.MATCHING_MODEL || "claude-opus-5-5",
    // claude-opus-5-5 list prices; the 5-minute cache write is 1.25x input. Edit with the provider's price list.
    price: {
      input: num(env.MATCHING_PRICE_INPUT, 4),
      output: num(env.MATCHING_PRICE_OUTPUT, 20),
      cacheWrite: num(env.MATCHING_PRICE_CACHE_WRITE, 5),
      cacheRead: num(env.MATCHING_PRICE_CACHE_READ, 0.2),
    },
    scoreOutputLimit: num(env.MATCHING_SCORE_OUTPUT_LIMIT, 4000),
    draftOutputLimit: num(env.MATCHING_DRAFT_OUTPUT_LIMIT, 8000),
    scoreTimeoutMs: 60_000,
    draftTimeoutMs: 120_000,
    concurrency: num(env.MATCHING_CONCURRENCY, 1),
  };
}
