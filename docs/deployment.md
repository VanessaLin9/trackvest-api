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

3. Reseed without resetting schema when fixtures drift:

```bash
pnpm db:seed
```

4. Create new migration files during feature work:

```bash
pnpm prisma:migrate
```

`prisma migrate dev` applies pending migrations to your **local dev DB** and may
prompt for a migration name. Commit the generated files under `prisma/migrations/`.

The dev seed (`pnpm db:seed` / `prisma/seed.ts`) wipes and recreates demo fixtures.
It is **not** safe for production or production-like databases. Production-safe seed
entry points are added in a separate task.

## Production and production-like — schema only

Schema changes in production and production-like environments must use:

```bash
pnpm db:migrate:deploy
```

This runs `prisma migrate deploy`: it applies pending migration SQL and **does not**
run the dev seed.

Check migration status before and after deploy:

```bash
pnpm db:migrate:status
```

### Production-like rehearsal on a temporary local database

Use this to verify migrations without creating real cloud resources:

1. Start a local Postgres instance (for example `pnpm db:up`).
2. Create a **dedicated** database or schema and set `DATABASE_URL` to it.
3. Export `NODE_ENV=production`.
4. Deploy migrations: `pnpm db:migrate:deploy`
5. Confirm status: `pnpm db:migrate:status`

Do not run `prisma migrate reset`, `prisma db push`, or `pnpm db:seed` in this mode.
Bootstrap and production demo seed commands will be documented here after they are
implemented.

## Forbidden in production and production-like

Never run these against production or a production-like database:

| Command | Why |
|---------|-----|
| `prisma migrate reset` | Drops the database and reruns dev seed |
| `prisma db push` | Bypasses migration history; can drift from committed migrations |
| `prisma migrate dev` | Dev workflow; may reset or prompt in ways unsafe for shared data |
| `pnpm db:seed` / `prisma/seed.ts` | Dev-only; wipes all tables before seeding |
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

1. Capture `pnpm db:migrate:status` output and the failing migration name.
2. Assess whether the database is partially migrated or unchanged.
3. Choose a recovery path:
   - **Forward-fix**: ship a new migration that repairs schema or backfills data.
   - **Restore from backup**: revert the database to a pre-deploy snapshot, then
     redeploy only after the root cause is fixed.

Prisma does not provide reliable automatic *down* migrations for production rollback.
Plan on backup restore or forward-fix migrations.

Provider-specific backup, restore, and point-in-time recovery procedures will be added
after a production database provider is selected.

## Application deploy checklist

Before starting the application against a production or production-like database:

1. `pnpm db:migrate:status` — confirm expected pending/applied state
2. `pnpm db:migrate:deploy` — apply pending migrations
3. `pnpm db:migrate:status` — confirm all migrations applied
4. Run production bootstrap and production demo seed when those commands exist
5. Start the API; use admin manual sync endpoints to verify external integrations
6. Leave scheduled jobs disabled unless `ENABLE_SCHEDULED_JOBS=true` is explicitly set

Scheduled job policy and seed separation are documented as those checkpoints land.

## Related documentation

- [README.md](../README.md) — local setup, dev seed, FinMind sync, testing
- [docs/mcp.md](./mcp.md) — MCP server; uses the same Postgres as the HTTP API
