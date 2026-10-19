#!/usr/bin/env bash
# `pnpm start:local`: run job-radar on this machine in one command — install, build the web app,
# apply pending migrations (db:migrate backs the database up first, so only when one is pending),
# then start the server with the provider key from .env.ship when it exists. Ctrl+C stops it;
# the data stays in apps/server/data.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! node -v | grep -Eq '^v(2[2-9]|[3-9][0-9])\.'; then
  echo "job-radar needs Node 22 or newer (found $(node -v)). Run: nvm use" >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm --filter @job-radar/web build

db="apps/server/${DATABASE_FILE:-data/job-radar.sqlite}"
case "${DATABASE_FILE:-}" in /*) db="$DATABASE_FILE" ;; esac
total=$(ls apps/server/drizzle/*.sql | wc -l | tr -d ' ')
applied=$(sqlite3 "$db" "select count(*) from __drizzle_migrations" 2>/dev/null || echo 0)
if [ "$applied" -lt "$total" ]; then
  pnpm --filter @job-radar/server db:migrate
fi

cd apps/server
env_file=()
[ -f ../../.env.ship ] && env_file=(--env-file=../../.env.ship)
exec npx tsx ${env_file[@]+"${env_file[@]}"} src/main.ts
