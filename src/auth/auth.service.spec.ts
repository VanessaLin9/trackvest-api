import { UnauthorizedException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'
import { AuthService } from './auth.service'
import type { AccessTokenService } from './tokens/access-token.service'
import type { IssuedRefreshToken, RefreshTokenService } from './tokens/refresh-token.service'

type PrismaLike = {
  user: { findUnique: jest.Mock }
}

function buildDeps(userRow: { id: string; email: string; role: UserRole; passwordHash: string } | null) {
  const prisma: PrismaLike = {
    user: { findUnique: jest.fn().mockResolvedValue(userRow) },
  }
  const access: AccessTokenService = {
    sign: jest.fn().mockReturnValue('access-jwt'),
    verify: jest.fn(),
  } as unknown as AccessTokenService
  const issued: IssuedRefreshToken = {
    token: 'raw-refresh',
    rowId: 'row-1',
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  }
  const refresh: RefreshTokenService = {
    issueForUser: jest.fn().mockResolvedValue(issued),
    rotate: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as RefreshTokenService
  return { prisma, access, refresh, issued }
}

describe('AuthService', () => {
  describe('login', () => {
    it('returns a session with tokens on correct credentials', async () => {
      const passwordHash = await bcrypt.hash('correct horse', 4)
      const { prisma, access, refresh } = buildDeps({
        id: 'u1',
        email: 'a@b.com',
        role: UserRole.user,
        passwordHash,
      })
      const svc = new AuthService(prisma as never, access, refresh)

      const session = await svc.login({ email: 'a@b.com', password: 'correct horse' })

      expect(session.user).toEqual({ id: 'u1', email: 'a@b.com', role: UserRole.user })
      expect(session.accessToken).toBe('access-jwt')
      expect(session.refreshToken).toBe('raw-refresh')
      expect(access.sign).toHaveBeenCalledWith('u1', UserRole.user)
      expect(refresh.issueForUser).toHaveBeenCalledWith('u1')
    })

    it('throws on wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct horse', 4)
      const { prisma, access, refresh } = buildDeps({
        id: 'u1',
        email: 'a@b.com',
        role: UserRole.user,
        passwordHash,
      })
      const svc = new AuthService(prisma as never, access, refresh)

      await expect(
        svc.login({ email: 'a@b.com', password: 'nope nope nope' }),
      ).rejects.toBeInstanceOf(UnauthorizedException)
      expect(refresh.issueForUser).not.toHaveBeenCalled()
    })

    it('rejects unknown emails with 401', async () => {
      const { prisma, access, refresh } = buildDeps(null)
      const svc = new AuthService(prisma as never, access, refresh)

      await expect(
        svc.login({ email: 'ghost@b.com', password: 'anything long enough' }),
      ).rejects.toBeInstanceOf(UnauthorizedException)
      expect(refresh.issueForUser).not.toHaveBeenCalled()
    })
  })

  describe('refreshSession', () => {
    it('rotates the refresh token and mints a fresh access token', async () => {
      const { prisma, access, refresh } = buildDeps(null)
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        role: UserRole.user,
      })
      ;(refresh.rotate as jest.Mock).mockResolvedValue({
        userId: 'u1',
        token: 'new-refresh',
        rowId: 'row-2',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      })
      const svc = new AuthService(prisma as never, access, refresh)

      const session = await svc.refreshSession('old-refresh')

      expect(refresh.rotate).toHaveBeenCalledWith('old-refresh')
      expect(session.refreshToken).toBe('new-refresh')
      expect(session.accessToken).toBe('access-jwt')
    })

    it('revokes all tokens if the user no longer exists', async () => {
      const { prisma, access, refresh } = buildDeps(null)
      prisma.user.findUnique.mockResolvedValue(null)
      ;(refresh.rotate as jest.Mock).mockResolvedValue({
        userId: 'gone',
        token: 'new-refresh',
        rowId: 'row-2',
        expiresAt: new Date(),
      })
      const svc = new AuthService(prisma as never, access, refresh)

      await expect(svc.refreshSession('old-refresh')).rejects.toBeInstanceOf(UnauthorizedException)
      expect(refresh.revokeAllForUser).toHaveBeenCalledWith('gone')
    })
  })

  describe('logout', () => {
    it('revokes the refresh token if present', async () => {
      const { prisma, access, refresh } = buildDeps(null)
      const svc = new AuthService(prisma as never, access, refresh)
      await svc.logout('some-token')
      expect(refresh.revoke).toHaveBeenCalledWith('some-token')
    })

    it('is a no-op when no token is provided', async () => {
      const { prisma, access, refresh } = buildDeps(null)
      const svc = new AuthService(prisma as never, access, refresh)
      await svc.logout(undefined)
      expect(refresh.revoke).not.toHaveBeenCalled()
    })
  })
})
