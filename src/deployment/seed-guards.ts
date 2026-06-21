import { isEnvFlagTrue } from './env-flags'
import { isLocalhostDatabaseUrl, parseDatabaseUrlHostname } from './database-url-guards'

export class SeedGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedGuardError'
  }
}

function assertDevSeedLocalDatabaseUrl(): void {
  const databaseUrl = process.env.DATABASE_URL?.trim()

  if (!databaseUrl) {
    throw new SeedGuardError(
      'Dev seed refused: DATABASE_URL is missing. Dev seed wipes data and is local-only. ' +
        'Set DATABASE_URL to a Postgres URL on localhost or 127.0.0.1.',
    )
  }

  const hostname = parseDatabaseUrlHostname(databaseUrl)
  if (!hostname) {
    throw new SeedGuardError(
      'Dev seed refused: DATABASE_URL is not a valid URL. Dev seed is local-only.',
    )
  }

  if (!isLocalhostDatabaseUrl(databaseUrl)) {
    throw new SeedGuardError(
      `Dev seed refused: DATABASE_URL host "${hostname}" is not allowed. ` +
        'Dev seed may only run against localhost or 127.0.0.1.',
    )
  }
}

/** Dev seed must not run under production runtime or against non-local databases. */
export function assertDevSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new SeedGuardError(
      'Dev seed refused: NODE_ENV=production. Dev seed wipes data and is local-only. ' +
        'Use pnpm db:seed:prod-demo with ALLOW_PRODUCTION_DEMO_SEED=true for production demo data, ' +
        'or pnpm db:bootstrap:prod for system bootstrap.',
    )
  }

  assertDevSeedLocalDatabaseUrl()
}

/** Production demo seed requires explicit opt-in. Call before any Prisma write. */
export function assertProductionDemoSeedAllowed(): void {
  if (!isEnvFlagTrue('ALLOW_PRODUCTION_DEMO_SEED')) {
    throw new SeedGuardError(
      'Production demo seed refused: set ALLOW_PRODUCTION_DEMO_SEED=true. ' +
        'Run: ALLOW_PRODUCTION_DEMO_SEED=true pnpm db:seed:prod-demo',
    )
  }
}
