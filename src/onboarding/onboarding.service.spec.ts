import { BadRequestException, ConflictException } from '@nestjs/common'
import { AccountType, Currency, GlAccountPurpose, Prisma, UserRole } from '@prisma/client'
import { OnboardingService } from './onboarding.service'

function buildTransactionMock() {
  const state = {
    users: [] as Array<{ id: string; email: string; passwordHash: string; role: UserRole }>,
    glAccounts: [] as Array<{ id: string; userId: string; purpose: GlAccountPurpose | null }>,
    accounts: [] as Array<{ id: string; userId: string; name: string }>,
    shouldFailGlCreate: false,
  }

  const db = {
    user: {
      create: jest.fn(async ({ data }) => {
        if (state.users.some((user) => user.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          })
        }
        const user = { id: `user-${state.users.length + 1}`, ...data }
        state.users.push(user)
        return user
      }),
    },
    glAccount: {
      findMany: jest.fn(async () => state.glAccounts),
      create: jest.fn(async ({ data }) => {
        if (state.shouldFailGlCreate) {
          throw new Error('gl create failed')
        }
        const row = { id: `gl-${state.glAccounts.length + 1}`, ...data }
        state.glAccounts.push(row)
        return row
      }),
      upsert: jest.fn(async ({ create }) => {
        const row = { id: `gl-linked-${state.glAccounts.length + 1}`, ...create }
        state.glAccounts.push(row)
        return row
      }),
    },
    account: {
      create: jest.fn(async ({ data }) => {
        const account = { id: `account-${state.accounts.length + 1}`, createdAt: new Date(), ...data }
        state.accounts.push(account)
        return account
      }),
    },
  }

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: typeof db) => Promise<unknown>) => {
      const snapshot = {
        users: [...state.users],
        glAccounts: [...state.glAccounts],
        accounts: [...state.accounts],
      }

      try {
        return await fn(db)
      } catch (error) {
        state.users = snapshot.users
        state.glAccounts = snapshot.glAccounts
        state.accounts = snapshot.accounts
        throw error
      }
    }),
  }

  const defaultChartProvisioningService = {
    provisionSystemAccounts: jest.fn(async (userId: string, _currency: Currency, tx: typeof db) => {
      const rows = [
        GlAccountPurpose.investment_bucket,
        GlAccountPurpose.equity_contribution,
        GlAccountPurpose.dividend_income,
        GlAccountPurpose.realized_gain_income,
        GlAccountPurpose.fee_expense,
        GlAccountPurpose.realized_loss_expense,
      ]
      for (const purpose of rows) {
        const row = await tx.glAccount.create({
          data: { userId, purpose, name: purpose, type: 'asset', currency: Currency.TWD },
        })
        state.glAccounts.push(row)
      }
      return rows
    }),
  }

  const accountsService = {
    createInTransaction: jest.fn(async (dto, tx: typeof db) => {
      const account = await tx.account.create({ data: dto })
      await tx.glAccount.upsert({
        where: { linkedAccountId: account.id },
        update: {},
        create: {
          userId: dto.userId,
          name: `linked-${account.id}`,
          type: 'asset',
          currency: dto.currency,
          linkedAccountId: account.id,
        },
      })
      return account
    }),
  }

  return {
    state,
    prisma,
    defaultChartProvisioningService,
    accountsService,
    service: new OnboardingService(
      prisma as never,
      defaultChartProvisioningService as never,
      accountsService as never,
    ),
  }
}

describe('OnboardingService', () => {
  const signupDto = {
    email: 'new-user@trackvest.local',
    password: 'secure-password',
    starterAccount: {
      name: 'Cathay Broker',
      type: AccountType.broker,
      currency: Currency.TWD,
      broker: 'cathay',
    },
  }

  it('creates user, default chart, starter account, and linked cash GL in one transaction', async () => {
    const { service, state, prisma, defaultChartProvisioningService, accountsService } =
      buildTransactionMock()

    const result = await service.signup(signupDto)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(defaultChartProvisioningService.provisionSystemAccounts).toHaveBeenCalledWith(
      result.user.id,
      Currency.TWD,
      expect.any(Object),
    )
    expect(accountsService.createInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: result.user.id,
        name: 'Cathay Broker',
        type: AccountType.broker,
        currency: Currency.TWD,
        broker: 'cathay',
      }),
      expect.any(Object),
    )
    expect(state.users).toHaveLength(1)
    expect(state.glAccounts.length).toBeGreaterThanOrEqual(7)
    expect(state.accounts).toHaveLength(1)
    expect(result.starterAccount.name).toBe('Cathay Broker')
  })

  it('maps duplicate email to conflict', async () => {
    const { service } = buildTransactionMock()

    await service.signup(signupDto)
    await expect(service.signup(signupDto)).rejects.toBeInstanceOf(ConflictException)
  })

  it('rolls back when downstream writes fail inside the transaction', async () => {
    const { service, state } = buildTransactionMock()
    state.shouldFailGlCreate = true

    await expect(service.signup(signupDto)).rejects.toThrow('gl create failed')
    expect(state.users).toHaveLength(0)
    expect(state.accounts).toHaveLength(0)
  })

  it('rejects invalid starter account input before creating a user', async () => {
    const { service, state, accountsService } = buildTransactionMock()
    accountsService.createInTransaction.mockRejectedValue(
      new BadRequestException('Broker must be cathay or empty for broker accounts'),
    )

    await expect(
      service.signup({
        ...signupDto,
        starterAccount: {
          ...signupDto.starterAccount,
          broker: 'invalid-broker',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(state.users).toHaveLength(0)
  })
})
