import { SeedGuardError } from '../../src/deployment/seed-guards'
import { DEV_ONLY_DEMO_PASSWORDS } from './demo-identity'

/** Local dev only — safe default for Docker reset/seed workflows. */
export function resolveDevDemoUserPassword() {
  return process.env.DEMO_USER_PASSWORD ?? DEV_ONLY_DEMO_PASSWORDS[0]
}

/** Production demo seed — no dev defaults. */
export function resolveProductionDemoUserPassword() {
  const password = process.env.DEMO_USER_PASSWORD?.trim()

  if (!password) {
    throw new SeedGuardError(
      'Production demo seed refused: DEMO_USER_PASSWORD must be set to a non-empty secret. ' +
        'Run: DEMO_USER_PASSWORD=<secret> ALLOW_PRODUCTION_DEMO_SEED=true pnpm db:seed:prod-demo',
    )
  }

  if ((DEV_ONLY_DEMO_PASSWORDS as readonly string[]).includes(password)) {
    throw new SeedGuardError(
      `Production demo seed refused: DEMO_USER_PASSWORD cannot use dev-only default "${password}". ` +
        'Set a unique secret for production or production-like environments.',
    )
  }

  return password
}
