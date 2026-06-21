import { isEnvFlagTrue } from './env-flags'

export class RehearsalGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RehearsalGuardError'
  }
}

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1'])

export function isLocalhostDatabaseUrl(databaseUrl: string): boolean {
  try {
    return LOCALHOST_HOSTS.has(new URL(databaseUrl).hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Rehearsal tooling may only target local Postgres — never remote hosts. */
export function assertLocalhostDatabaseUrl(databaseUrl: string): void {
  let hostname: string

  try {
    hostname = new URL(databaseUrl).hostname
  } catch {
    throw new RehearsalGuardError(
      'Rehearsal refused: DATABASE_URL is not a valid URL. ' +
        'Rehearsal is limited to localhost or 127.0.0.1.',
    )
  }

  if (!isLocalhostDatabaseUrl(databaseUrl)) {
    throw new RehearsalGuardError(
      `Rehearsal refused: DATABASE_URL host "${hostname}" is not allowed. ` +
        'Rehearsal may only run against localhost or 127.0.0.1.',
    )
  }
}

/** Dropping and recreating trackvest_rehearsal requires explicit opt-in. */
export function assertRehearsalDbRecreateAllowed(): void {
  if (!isEnvFlagTrue('ALLOW_REHEARSAL_DB_RECREATE')) {
    throw new RehearsalGuardError(
      'Rehearsal refused: set ALLOW_REHEARSAL_DB_RECREATE=true. ' +
        'Run: ALLOW_REHEARSAL_DB_RECREATE=true pnpm db:rehearsal',
    )
  }
}
