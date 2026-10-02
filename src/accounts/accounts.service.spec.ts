import { AccountType, Currency, UserRole } from '@prisma/client'
import { AccountsService } from './accounts.service'

describe('AccountsService session owner', () => {
  function createHarness() {
    const db = {
      account: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'acc-1',
          ...data,
        })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'acc-1',
          ...data,
        })),
        findUnique: jest.fn(),
      },
      glAccount: {
        upsert: jest.fn(async () => ({})),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof db) => Promise<unknown>) => fn(db)),
    }
    const ownershipService = {
      validateUserExists: jest.fn(),
      validateAccountOwnership: jest.fn(),
    }
    const service = new AccountsService(prisma as never, ownershipService as never)
    return { service, db, ownershipService }
  }

  const sessionUser = { id: 'session-user', role: UserRole.user }

  it('creates an account for the session user', async () => {
    const { service, db, ownershipService } = createHarness()

    await service.create(
      {
        name: 'Broker TWD',
        type: AccountType.broker,
        currency: Currency.TWD,
        broker: 'cathay',
      },
      sessionUser,
    )

    expect(ownershipService.validateUserExists).toHaveBeenCalledWith('session-user')
    expect(db.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'session-user',
        name: 'Broker TWD',
        broker: 'cathay',
      }),
    })
  })

  it('keeps the existing owner when an account is updated', async () => {
    const { service, db, ownershipService } = createHarness()
    db.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      userId: 'owner-1',
      name: 'Old',
      type: AccountType.broker,
      currency: Currency.TWD,
      broker: 'cathay',
    })

    await service.update(
      'acc-1',
      {
        name: 'Renamed',
        type: AccountType.cash,
        currency: Currency.USD,
      },
      { id: 'admin-1', role: UserRole.admin },
    )

    expect(ownershipService.validateAccountOwnership).toHaveBeenCalledWith('acc-1', {
      id: 'admin-1',
      role: UserRole.admin,
    })
    expect(db.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        userId: 'owner-1',
        name: 'Renamed',
        type: AccountType.cash,
        broker: null,
      }),
    })
  })

  it('rejects a new unsupported broker', async () => {
    const { service } = createHarness()

    await expect(
      service.create(
        {
          name: 'Broker USD',
          type: AccountType.broker,
          currency: Currency.USD,
          broker: 'ib',
        },
        sessionUser,
      ),
    ).rejects.toThrow('Broker must be cathay or empty')
  })

  it('keeps a stored broker that is not cathay when the update sends it back', async () => {
    const { service, db } = createHarness()
    db.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      userId: 'owner-1',
      name: 'Broker USD',
      type: AccountType.broker,
      currency: Currency.USD,
      broker: 'ib',
    })

    await service.update(
      'acc-1',
      {
        name: 'Broker USD renamed',
        type: AccountType.broker,
        currency: Currency.USD,
        broker: 'ib',
      },
      sessionUser,
    )

    expect(db.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: expect.objectContaining({
        broker: 'ib',
      }),
    })
  })

  it('does not let an update switch a cathay account to an unsupported broker', async () => {
    const { service, db } = createHarness()
    db.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      userId: 'owner-1',
      name: 'Broker TWD',
      type: AccountType.broker,
      currency: Currency.TWD,
      broker: 'cathay',
    })

    await expect(
      service.update(
        'acc-1',
        {
          name: 'Broker TWD',
          type: AccountType.broker,
          currency: Currency.TWD,
          broker: 'ib',
        },
        sessionUser,
      ),
    ).rejects.toThrow('Broker must be cathay or empty')
  })
})
