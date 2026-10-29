import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { isEmail } from 'class-validator'
import { isLocalhostDatabaseUrl } from '../deployment/database-url-guards'

export class LocalPasswordResetError extends Error {}

/** This maintenance tool is deliberately separate from the HTTP auth surface. */
export function assertLocalPasswordResetAllowed(): URL {
  if (process.env.NODE_ENV === 'production') {
    throw new LocalPasswordResetError('Password reset refused: NODE_ENV=production.')
  }

  const databaseUrl = process.env.DATABASE_URL
  let target: URL
  try {
    target = new URL(databaseUrl ?? '')
  } catch {
    throw new LocalPasswordResetError('Password reset refused: DATABASE_URL is missing or invalid.')
  }

  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !isLocalhostDatabaseUrl(databaseUrl!) ||
    target.searchParams.has('host')
  ) {
    throw new LocalPasswordResetError(
      'Password reset refused: use a PostgreSQL URL on localhost or 127.0.0.1 without a host override.',
    )
  }

  return target
}

export async function resetLocalPassword(
  prisma: PrismaClient,
  email: string,
  password: string,
  confirmation: string,
): Promise<{ email: string; revokedRefreshTokens: number }> {
  assertLocalPasswordResetAllowed()
  const normalizedEmail = email.trim()
  if (!isEmail(normalizedEmail)) {
    throw new LocalPasswordResetError('Enter a valid account email.')
  }
  if (password !== confirmation) {
    throw new LocalPasswordResetError('Passwords do not match. No changes were made.')
  }
  // bcrypt uses at most 72 bytes. Refuse truncation, including multibyte input.
  if (Array.from(password).length < 6 || !password.trim() || Buffer.byteLength(password, 'utf8') > 72) {
    throw new LocalPasswordResetError('Use at least 6 characters and at most 72 UTF-8 bytes.')
  }

  const passwordHash = await bcrypt.hash(password, 10)
  return prisma.$transaction(async (db) => {
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    })
    if (!user) {
      throw new LocalPasswordResetError('Account not found. No changes were made.')
    }

    await db.user.update({ where: { id: user.id }, data: { passwordHash } })
    const revoked = await db.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return { email: user.email, revokedRefreshTokens: revoked.count }
  })
}
