import type { PrismaClient } from '@prisma/client'
import { withEnv } from '../deployment/testing/with-env'
import { assertLocalPasswordResetAllowed, LocalPasswordResetError, resetLocalPassword } from './local-password-reset'

const localUrl = 'postgresql://trackvest:trackvest@localhost:5433/trackvest?schema=public'

describe('local password reset guards', () => {
  it.each(['localhost', '127.0.0.1'])('allows a local PostgreSQL database on %s', async (host) => {
    await withEnv({ NODE_ENV: 'development', DATABASE_URL: localUrl.replace('localhost', host) }, () => {
      expect(assertLocalPasswordResetAllowed().hostname).toBe(host)
    })
  })

  it('refuses production even with a local URL', async () => {
    await withEnv({ NODE_ENV: 'production', DATABASE_URL: localUrl }, () => {
      expect(assertLocalPasswordResetAllowed).toThrow(/NODE_ENV=production/)
    })
  })

  it.each([
    undefined,
    '',
    'not-a-url',
    'postgresql://user:private-password@db.example.com/trackvest',
    'https://localhost/trackvest',
    `${localUrl}&host=db.example.com`,
    'postgresql://localhost.example.com/trackvest',
  ])('refuses missing, invalid, remote or overridden database URLs', async (databaseUrl) => {
    await withEnv({ NODE_ENV: undefined, DATABASE_URL: databaseUrl }, () => {
      expect(assertLocalPasswordResetAllowed).toThrow(LocalPasswordResetError)
      try { assertLocalPasswordResetAllowed() } catch (error) {
        expect((error as Error).message).not.toContain('private-password')
      }
    })
  })
})

describe('local password reset input', () => {
  it.each([
    ['not-an-email', 'new-password', 'new-password'],
    ['user@example.com', 'new-password', 'different-password'],
    ['user@example.com', 'short', 'short'],
    ['user@example.com', '      ', '      '],
    ['user@example.com', 'a'.repeat(73), 'a'.repeat(73)],
    ['user@example.com', '密'.repeat(25), '密'.repeat(25)],
  ])('rejects invalid input before starting a database transaction', async (email, password, confirmation) => {
    const transaction = jest.fn()
    const prisma = { $transaction: transaction } as unknown as PrismaClient
    await withEnv({ NODE_ENV: 'test', DATABASE_URL: localUrl }, async () => {
      await expect(resetLocalPassword(prisma, email, password, confirmation)).rejects.toBeInstanceOf(LocalPasswordResetError)
    })
    expect(transaction).not.toHaveBeenCalled()
  })
})
