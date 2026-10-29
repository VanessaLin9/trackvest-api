import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'
import { AuthService } from '../src/auth/auth.service'
import { resetLocalPassword, assertLocalPasswordResetAllowed } from '../src/auth/local-password-reset'
import type { PrismaService } from '../src/prisma.service'
import type { AccessTokenService } from '../src/auth/tokens/access-token.service'
import type { RefreshTokenService } from '../src/auth/tokens/refresh-token.service'
import { createTestDatabaseConfig, prepareTestDatabase, dropTestSchema } from './helpers/e2e-db'

jest.setTimeout(60000)

describe('local password reset (isolated database schema)', () => {
  const previousUrl = process.env.DATABASE_URL
  let config: ReturnType<typeof createTestDatabaseConfig>
  let prisma: PrismaClient
  let targetId: string
  let otherId: string
  let oldHash: string
  const email = 'reset-target@example.com'
  const oldPassword = 'old-password'
  const newPassword = 'a-new-密碼-password'
  const previouslyRevokedAt = new Date('2026-01-01T00:00:00Z')

  beforeAll(async () => {
    config = createTestDatabaseConfig()
    if (!/^e2e_[a-f0-9]{32}$/.test(config.schema)) throw new Error('Expected an isolated test schema')
    process.env.DATABASE_URL = config.testUrl
    assertLocalPasswordResetAllowed()
    prepareTestDatabase(config.testUrl)
    prisma = new PrismaClient()
    await prisma.$connect()
    oldHash = await bcrypt.hash(oldPassword, 4)
  })

  afterAll(async () => {
    if (prisma) await prisma.$disconnect()
    if (prisma && config) await dropTestSchema(config.adminUrl, config.schema)
    if (previousUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousUrl
  })

  beforeEach(async () => {
    await prisma.user.deleteMany()
    const target = await prisma.user.create({ data: { email, passwordHash: oldHash } })
    const other = await prisma.user.create({ data: { email: 'other@example.com', passwordHash: oldHash } })
    targetId = target.id
    otherId = other.id
    const account = await prisma.account.create({ data: { userId: targetId, name: 'My broker', type: 'broker', broker: 'cathay', currency: 'TWD' } })
    await prisma.transaction.create({ data: { accountId: account.id, type: 'deposit', amount: '1234.56', tradeTime: new Date() } })
    await prisma.refreshToken.createMany({ data: [
      { userId: targetId, tokenHash: 'target-active', expiresAt: new Date(Date.now() + 60000) },
      { userId: targetId, tokenHash: 'target-revoked', expiresAt: new Date(Date.now() + 60000), revokedAt: previouslyRevokedAt },
      { userId: otherId, tokenHash: 'other-active', expiresAt: new Date(Date.now() + 60000) },
    ] })
  })

  async function financialSnapshot() {
    return {
      accounts: await prisma.account.findMany({ orderBy: { id: 'asc' } }),
      transactions: await prisma.transaction.findMany({ orderBy: { id: 'asc' } }),
    }
  }

  it('allows the new login, rejects the old one, revokes only target tokens and preserves financial data', async () => {
    const financialBefore = await financialSnapshot()
    const otherBefore = await prisma.user.findUniqueOrThrow({ where: { id: otherId } })
    const otherTokenBefore = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: 'other-active' } })
    const result = await resetLocalPassword(prisma, ` ${email} `, newPassword, newPassword)
    expect(result).toEqual({ email, revokedRefreshTokens: 1 })
    const user = await prisma.user.findUniqueOrThrow({ where: { id: targetId } })
    expect(user.passwordHash).not.toBe(newPassword)
    expect(user.passwordHash).not.toBe(oldHash)
    const auth = new AuthService(
      prisma as PrismaService,
      { sign: jest.fn().mockReturnValue('access') } as unknown as AccessTokenService,
      { issueForUser: jest.fn().mockResolvedValue({ token: 'refresh', rowId: 'new', expiresAt: new Date() }) } as unknown as RefreshTokenService,
    )
    await expect(auth.login({ email, password: oldPassword })).rejects.toThrow('Invalid email or password')
    await expect(auth.login({ email, password: newPassword })).resolves.toMatchObject({ user: { id: targetId, email, role: UserRole.user } })
    expect((await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: 'target-active' } })).revokedAt).not.toBeNull()
    expect((await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: 'target-revoked' } })).revokedAt).toEqual(previouslyRevokedAt)
    expect(await prisma.user.findUniqueOrThrow({ where: { id: otherId } })).toEqual(otherBefore)
    expect(await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: 'other-active' } })).toEqual(otherTokenBefore)
    expect(await financialSnapshot()).toEqual(financialBefore)
  })

  it('does not create an unknown account or modify any existing credentials', async () => {
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } })
    const tokens = await prisma.refreshToken.findMany({ orderBy: { id: 'asc' } })
    await expect(resetLocalPassword(prisma, 'missing@example.com', newPassword, newPassword)).rejects.toThrow('Account not found')
    expect(await prisma.user.findMany({ orderBy: { id: 'asc' } })).toEqual(users)
    expect(await prisma.refreshToken.findMany({ orderBy: { id: 'asc' } })).toEqual(tokens)
  })

  it('rolls back the password update if token revocation fails', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${config.schema}".reject_local_reset_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test revocation failure'; END; $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_local_reset_revoke BEFORE UPDATE ON "${config.schema}"."RefreshToken" FOR EACH ROW EXECUTE FUNCTION "${config.schema}".reject_local_reset_revoke()`)
    try {
      await expect(resetLocalPassword(prisma, email, newPassword, newPassword)).rejects.toThrow()
      expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).passwordHash).toBe(oldHash)
      expect((await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: 'target-active' } })).revokedAt).toBeNull()
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER reject_local_reset_revoke ON "${config.schema}"."RefreshToken"`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${config.schema}".reject_local_reset_revoke()`)
    }
  })
})
