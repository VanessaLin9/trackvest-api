import { isEnvFlagTrue } from './env-flags'

export class SeedGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedGuardError'
  }
}

/** Dev seed must not run under production runtime. Call before any Prisma write. */
export function assertDevSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new SeedGuardError(
      'Dev seed refused: NODE_ENV=production. Dev seed wipes data and is local-only. ' +
        'Use pnpm db:seed:prod-demo with ALLOW_PRODUCTION_DEMO_SEED=true for production demo data, ' +
        'or pnpm db:bootstrap:prod for system bootstrap.',
    )
  }
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
