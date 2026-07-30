import { isEnvFlagTrue } from './env-flags'
import { isLocalhostDatabaseUrl, parseDatabaseUrlHostname } from './database-url-guards'

export { isLocalhostDatabaseUrl } from './database-url-guards'

export const REHEARSAL_DATABASE_NAME = 'trackvest_rehearsal'

export class RehearsalGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RehearsalGuardError'
  }
}

/** Rehearsal 只能打本機 Postgres，禁止遠端 host（PR #27）。 */
export function assertLocalhostDatabaseUrl(databaseUrl: string): void {
  const hostname = parseDatabaseUrlHostname(databaseUrl)

  if (!hostname) {
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

/** Drop／重建 `trackvest_rehearsal` 需明確 opt-in（PR #27）。 */
export function assertRehearsalDbRecreateAllowed(): void {
  if (!isEnvFlagTrue('ALLOW_REHEARSAL_DB_RECREATE')) {
    throw new RehearsalGuardError(
      'Rehearsal refused: set ALLOW_REHEARSAL_DB_RECREATE=true. ' +
        'Run: ALLOW_REHEARSAL_DB_RECREATE=true pnpm db:rehearsal',
    )
  }
}

/** Only the dedicated rehearsal database may be dropped and recreated. */
export function assertRehearsalRecreateTargetDatabaseName(databaseName: string): void {
  if (databaseName !== REHEARSAL_DATABASE_NAME) {
    throw new RehearsalGuardError(
      `Rehearsal refused: database "${databaseName}" is not an allowed recreate target. ` +
        `Only "${REHEARSAL_DATABASE_NAME}" may be dropped and recreated.`,
    )
  }
}
