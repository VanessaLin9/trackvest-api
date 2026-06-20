import bcrypt from 'bcrypt'
import { BCRYPT_ROUNDS, DEMO_USER_ID } from './demo-identity'
import type { SeedDbClient } from './seed-db-client'

/**
 * Reuse existing bcrypt hash when the secret is unchanged; hash only when rotating.
 */
export async function resolveDemoUserPasswordHash(db: SeedDbClient, password: string) {
  const existing = await db.user.findUnique({
    where: { id: DEMO_USER_ID },
    select: { passwordHash: true },
  })

  if (existing && (await bcrypt.compare(password, existing.passwordHash))) {
    return existing.passwordHash
  }

  return bcrypt.hash(password, BCRYPT_ROUNDS)
}
