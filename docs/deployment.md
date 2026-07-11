# Deployment and database migration

This runbook describes how to change the database schema safely across environments.
It is version-controlled with the application and applies even before a production
database provider is chosen.

For day-to-day local development, start with [README.md](../README.md) — especially
**Local setup**. That flow is **dev-only** and may destroy data.

## Environments

| Environment | Database | Purpose |
|-------------|----------|---------|
| Local dev | Docker Postgres via `pnpm db:up` | Daily development; reset and dev seed allowed |
| Production-like rehearsal | Temporary local Docker Postgres with its own `DATABASE_URL` | Validate migration and deploy steps before real production; not a long-lived staging DB |
| Production | Future dedicated Postgres | Real user data; destructive dev commands are forbidden |

Production-like rehearsal must set `NODE_ENV=production` and use a **temporary**
local `DATABASE_URL`. Never point rehearsal or deploy commands at a shared dev database
or an unidentified remote URL.

## Local development — schema and seed

Use this flow on the Docker dev database only.

1. Start infrastructure: `pnpm db:up`
2. Reset schema, apply migrations, and run the dev seed:

```bash
npx prisma migrate reset --force
```

3. Reseed without resetting schema when fixtures drift (dev-only — wipes all data):

```bash
pnpm db:seed
```

Or equivalently:

```bash
pnpm db:seed:dev
```

4. Create new migration files during feature work:

```bash
pnpm prisma:migrate
```

`prisma migrate dev` applies pending migrations to your **local dev DB** and may
prompt for a migration name. Commit the generated files under `prisma/migrations/`.

The dev seed (`pnpm db:seed` / `pnpm db:seed:dev`) wipes and recreates demo fixtures.
It is **not** safe for production or production-like databases. Dev seed is refused when
`NODE_ENV=production` or when `DATABASE_URL` is missing, invalid, or not on
`localhost` / `127.0.0.1`.

## Production bootstrap and demo seed

After migrations are applied, production and production-like environments should run:

```bash
pnpm db:bootstrap:prod
```

Idempotent shared catalog bootstrap — upserts **Asset** and **AssetAlias** fixtures required by the demo portfolio, then fetches official TWSE/TPEX open data to bootstrap Taiwan listed stocks, OTC stocks, and listed ETFs (create-only; does not overwrite existing assets or aliases). Does not seed Price, FxRate, or demo-user data.

Standalone TW catalog command (same implementation as seed integration):

```bash
# plan only — no database writes
pnpm assets:bootstrap:tw -- --dry-run

# write missing assets and global aliases
pnpm assets:bootstrap:tw
```

**Scope (v1):** TWSE listed stocks, TPEX OTC stocks, TWSE listed ETFs with recognised `基金類型`. Excludes emerging market, ETN, warrants, futures, and uncertain products.

**Data sources:** TWSE `t187ap03_L`, `t187ap47_L`; TPEX `mopsfin_t187ap03_O`. Requires outbound HTTPS to official open-data endpoints.

**Failure behaviour:** If any required source is unavailable or returns an unexpected payload, the TW bootstrap fails closed before writing Taiwan catalog rows. Retry with the standalone command above.

**Not solved by catalog bootstrap:** broker-specific CSV aliases (e.g. Cathay display names) still require separate alias resolution work. Import preview/commit remains independent.

Dev seed (`pnpm db:seed`) wipes the database, loads demo catalog fixtures, then runs the same TW bootstrap before seeding the demo user graph.

To load the demo user graph without wiping global catalog data:

```bash
DEMO_USER_PASSWORD=<secret> ALLOW_PRODUCTION_DEMO_SEED=true pnpm db:seed:prod-demo
```

Requirements:

- `ALLOW_PRODUCTION_DEMO_SEED=true` (explicit opt-in)
- `DEMO_USER_PASSWORD` set to a non-empty secret (no default in production)
- Run `pnpm db:bootstrap:prod` first on a fresh database so catalog assets exist
- Prod-demo seeds **demo-user-owned graph only** via upsert; refuses if fixed ids belong to a non-demo user
- Does **not** seed Price or FxRate

## Production and production-like — schema only

Schema changes in production and production-like environments must use:

```bash
pnpm db:migrate:deploy
```

This runs `prisma migrate deploy`: it applies pending migration SQL and **does not**
run the dev seed.

### Migration status and exit codes

Check migration status before and after deploy:

```bash
pnpm db:migrate:status
```

This runs `prisma migrate status`. It may exit with code **1** for several reasons.
**Do not treat exit 1 by itself as an incident** — read the command output first.

**Before deploy**

| Outcome | Meaning | Action |
|---------|---------|--------|
| Exit **0** | Database is up to date; no pending migrations | Safe to start the app if no new release migrations are expected |
| Exit **1**, output shows **pending migrations only** | Expected when a release includes new migration files | Confirm the pending list matches the release, then run `pnpm db:migrate:deploy` |
| Exit **1**, **connection error** | Cannot reach the database | **Blocking** — fix connectivity; do not deploy |
| Exit **1**, **migration history divergence** | `_prisma_migrations` does not match `prisma/migrations/` | **Blocking** — stop; resolve divergence before deploy |
| Exit **1**, **failed migration** | A migration is recorded as failed | **Blocking** — stop; recover before deploy (see below) |

**After deploy**

`pnpm db:migrate:status` should exit **0** with no pending, failed, or diverged
migrations. Exit **1** after deploy is **blocking** — investigate before starting
the application.

### Production-like rehearsal on a temporary local database

Use this to verify migrations without creating real cloud resources.

**Automated rehearsal**

```bash
ALLOW_REHEARSAL_DB_RECREATE=true pnpm db:rehearsal
```

Requires `ALLOW_REHEARSAL_DB_RECREATE=true` and a `DATABASE_URL` whose host is
`localhost` or `127.0.0.1` only — remote hosts are refused.

This recreates local database `trackvest_rehearsal` on the Docker Postgres instance,
sets `NODE_ENV=production`, runs `migrate deploy`, bootstrap, prod-demo seed twice
for idempotency, and verifies dev seed is refused.

**Integration tests**

```bash
pnpm test:deployment
```

Uses an ephemeral `rehearsal_<uuid>` schema on the same Postgres instance; dropped after
the suite completes. Also limited to localhost or `127.0.0.1` hosts.

**Manual checklist**

1. Start a local Postgres instance: `pnpm db:up`
2. Point at a **dedicated** database — not your daily dev `trackvest` database:

```bash
export DATABASE_URL="postgresql://trackvest:trackvest@localhost:5433/trackvest_rehearsal?schema=public"
export NODE_ENV=production
```

3. Deploy migrations: `pnpm db:migrate:deploy`
4. Confirm status: `pnpm db:migrate:status` — must exit **0** with no pending, failed, or diverged migrations
5. Bootstrap catalog: `pnpm db:bootstrap:prod`
6. Load demo graph when needed:

```bash
DEMO_USER_PASSWORD=<secret> ALLOW_PRODUCTION_DEMO_SEED=true pnpm db:seed:prod-demo
```

7. Re-run steps 5–6 to confirm idempotency — row counts should not change
8. Confirm dev seed is refused: `NODE_ENV=production pnpm db:seed:dev` must fail before any write
9. Start the API with `ENABLE_SCHEDULED_JOBS` unset; verify manual sync endpoints work

Do not run `prisma migrate reset`, `prisma db push`, or `pnpm db:seed` in this mode.
Run `pnpm db:bootstrap:prod` and, when demo data is needed,
`ALLOW_PRODUCTION_DEMO_SEED=true pnpm db:seed:prod-demo` instead of dev seed.

After rehearsal, your daily dev database is unchanged. To restore dev fixtures on the
main `trackvest` database:

```bash
npx prisma migrate reset --force
```

## Forbidden in production and production-like

Never run these against production or a production-like database:

| Command | Why |
|---------|-----|
| `prisma migrate reset` | Drops the database and reruns dev seed |
| `prisma db push` | Bypasses migration history; can drift from committed migrations |
| `prisma migrate dev` | Dev workflow; may reset or prompt in ways unsafe for shared data |
| `pnpm db:seed` / `pnpm db:seed:dev` | Dev-only; wipes all tables before seeding |
| `pnpm db:seed:prod-demo` without `ALLOW_PRODUCTION_DEMO_SEED=true` | Refused by seed guard |
| Custom scripts that truncate tables or bulk-delete without ownership filters | Data loss |

Hostname or database name alone must **not** be treated as an environment guard.
Use explicit process configuration (`NODE_ENV`, dedicated `DATABASE_URL`, and future
seed guards).

## Creating schema changes — developer workflow

1. Edit `prisma/schema.prisma` on a feature branch.
2. Run `pnpm prisma:migrate` against the **local dev DB** to generate a migration file.
3. Commit both `schema.prisma` and `prisma/migrations/<timestamp>_<name>/`.
4. Open a PR; reviewers confirm migration SQL is safe for existing data.
5. After merge, deploy with `pnpm db:migrate:deploy` in production-like rehearsal,
   then in production when ready.

Do not merge schema changes without a committed migration file.

## When a migration fails or looks wrong

**Stop the deploy.** Do not retry blindly or run destructive recovery commands.

A failed migration leaves a record in `_prisma_migrations`. Until that record is
resolved, subsequent `pnpm db:migrate:deploy` runs will usually remain **blocked**.
You cannot skip this by shipping a new forward-fix migration alone.

1. Capture `pnpm db:migrate:status` output and the failing migration name.
2. Read the migration SQL under `prisma/migrations/<name>/migration.sql`.
3. Assess whether partial schema or data changes were applied to the database.
4. Take or verify a backup when production or production-like data is involved.
5. Choose a recovery path with reviewer sign-off — do not automate this decision.

`<migration_name>` is the migration folder name, for example `20260605183705_corp_actions`.

### Path A — return to pre-migration state

Use when the migration should be treated as not applied.

1. Revert partial changes manually **or** restore from backup.
2. Confirm the database matches the state **before** this migration ran.
3. Clear the failed record:

```bash
pnpm exec prisma migrate resolve --rolled-back <migration_name>
```

4. Fix the migration problem in the codebase — correct SQL or ship a revised migration on a new deploy.
5. Redeploy: `pnpm db:migrate:deploy`
6. Confirm: `pnpm db:migrate:status` exits **0** with no pending, failed, or diverged migrations.

### Path B — complete the migration forward

Use when the migration SQL was fully applied manually and the database already matches
the migration's intended end state.

1. Finish any remaining SQL by hand and verify schema and data against the intended end state.
2. Mark the migration as applied:

```bash
pnpm exec prisma migrate resolve --applied <migration_name>
```

3. Apply any later pending migrations: `pnpm db:migrate:deploy`
4. Confirm: `pnpm db:migrate:status` exits **0** with no pending, failed, or diverged migrations.

### If the database state is unclear

**Stop.** Do not run `migrate resolve` or deploy again.

Restore from backup to a known-good snapshot, then restart from **Path A** after a
reviewer confirms the restored state. Adding a new migration file does **not** clear
a failed migration record and is not a substitute for resolve.

Prisma does not provide reliable automatic *down* migrations for production rollback.

Provider-specific backup, restore, and point-in-time recovery procedures will be added
after a production database provider is selected.

## Application deploy checklist

Before starting the application against a production or production-like database:

1. `pnpm db:migrate:status` — read output; exit **1** is OK **only** if it shows expected pending migrations and no connection error, divergence, or failed migration
2. `pnpm db:migrate:deploy` — apply pending migrations
3. `pnpm db:migrate:status` — must exit **0** with no pending, failed, or diverged migrations
4. Run `pnpm db:bootstrap:prod` and, when needed, `ALLOW_PRODUCTION_DEMO_SEED=true pnpm db:seed:prod-demo`
5. Start the API; use admin manual sync endpoints to verify external integrations
6. Leave scheduled jobs disabled unless `ENABLE_SCHEDULED_JOBS=true` is explicitly set

## Scheduled jobs

`ScheduleModule` is always registered so cron handlers exist, but they **no-op** unless
`ENABLE_SCHEDULED_JOBS=true`. Unset or any value other than exactly `true` keeps jobs
disabled — safe for production deploy and production-like rehearsal.

| Variable | Default | Effect |
|----------|---------|--------|
| `ENABLE_SCHEDULED_JOBS` | disabled | When `true`, runs TW/US price sync and split sync crons |

Manual sync remains available via admin HTTP endpoints and CLI scripts
(`pnpm prices:sync-tw`, `pnpm prices:sync-us`, `pnpm corp-actions:sync-splits`) regardless
of this flag.

For local development, leave the flag unset unless you want the API process to run
scheduled FinMind sync on cron. Production and production-like environments should keep
it disabled until external integrations are verified via manual sync.

## Related documentation

- [README.md](../README.md) — local setup, dev seed, FinMind sync, testing
- [docs/mcp.md](./mcp.md) — MCP server; uses the same Postgres as the HTTP API
