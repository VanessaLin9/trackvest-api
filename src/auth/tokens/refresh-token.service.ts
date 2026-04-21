import { Injectable, UnauthorizedException } from '@nestjs/common'
import { randomBytes, createHash } from 'node:crypto'
import { PrismaService } from '../../prisma.service'
import { AuthConfig } from '../auth.config'

export interface IssuedRefreshToken {
  /** Raw token to be sent to the client (once). Never stored. */
  token: string
  /** Row id in the DB. Used to chain rotations via `replacedById`. */
  rowId: string
  expiresAt: Date
}

/**
 * Opaque rotating refresh tokens.
 *
 * Design:
 * - The raw token leaves the server exactly once, written into an httpOnly
 *   cookie. The DB stores only its sha256.
 * - Each use of `rotate()` revokes the current row and creates a new one,
 *   chained via `replacedById`.
 * - If a client presents an already-revoked token, we walk the chain to
 *   the current leaf and revoke the entire family (replay / theft
 *   detection). Legitimate clients never hit this path because they move
 *   forward on rotation.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AuthConfig,
  ) {}

  async issueForUser(userId: string): Promise<IssuedRefreshToken> {
    const token = this.generateRawToken()
    const tokenHash = this.hash(token)
    const expiresAt = new Date(Date.now() + this.config.refreshTtlSec * 1000)

    const row = await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
      select: { id: true },
    })

    return { token, rowId: row.id, expiresAt }
  }

  /**
   * Validate a raw token and atomically swap it for a new one. Returns
   * the new token + owning user id. Throws UnauthorizedException on any
   * failure (unknown token, revoked, expired, etc.).
   */
  async rotate(rawToken: string): Promise<IssuedRefreshToken & { userId: string }> {
    const tokenHash = this.hash(rawToken)
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
        replacedById: true,
      },
    })

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token')
    }

    if (existing.revokedAt !== null) {
      await this.revokeAllForUser(existing.userId)
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked')
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      })
      throw new UnauthorizedException('Refresh token expired')
    }

    const newToken = this.generateRawToken()
    const newHash = this.hash(newToken)
    const newExpiresAt = new Date(Date.now() + this.config.refreshTtlSec * 1000)

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
        },
        select: { id: true },
      })
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedById: row.id },
      })
      return row
    })

    return {
      token: newToken,
      rowId: created.id,
      expiresAt: newExpiresAt,
      userId: existing.userId,
    }
  }

  /** Revoke a single refresh token (best-effort; ignores unknown tokens). */
  async revoke(rawToken: string): Promise<void> {
    const tokenHash = this.hash(rawToken)
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private generateRawToken(): string {
    return randomBytes(32).toString('base64url')
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
