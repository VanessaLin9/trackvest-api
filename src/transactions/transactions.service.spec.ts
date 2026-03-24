import type { Prisma, Transaction } from '@prisma/client'
import { TransactionsService } from './transactions.service'

describe('TransactionsService.create', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const assetId = 'asset-1'
  const tradeTime = '2026-03-25T09:30:00.000Z'

  function buildCreatedTransaction(
    overrides: Record<string, unknown> = {},
  ): Transaction {
    return {
      id: 'tx-1',
      accountId,
      assetId,
      type: 'buy',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 15,
      tax: 0,
      brokerOrderNo: null,
      tradeTime: new Date(tradeTime),
      note: 'Build position',
      isDeleted: false,
      deletedAt: null,
      account: {
        userId,
      },
      ...overrides,
    } as unknown as Transaction
  }

  function createHarness() {
    const txClient = {
      transaction: {
        create: jest.fn(),
      },
      account: {
        findUniqueOrThrow: jest.fn(),
      },
      position: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    }

    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(txClient as unknown as Prisma.TransactionClient),
      ),
    }

    const postingService = {
      postTransaction: jest.fn(),
    }

    const ownershipService = {
      validateAccountOwnership: jest.fn(),
    }

    const service = new TransactionsService(
      prisma as never,
      postingService as never,
      ownershipService as never,
    )

    return {
      service,
      prisma,
      txClient,
      postingService,
      ownershipService,
    }
  }

  it('creates a new position for the first buy in an account', async () => {
    const { service, prisma, txClient, postingService, ownershipService } =
      createHarness()
    const createdTransaction = buildCreatedTransaction()

    txClient.transaction.create.mockResolvedValue(createdTransaction)
    txClient.position.findFirst.mockResolvedValue(null)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-1' })

    const result = await service.create(
      {
        accountId,
        assetId,
        type: 'buy',
        amount: 1015,
        quantity: 10,
        price: 100,
        fee: 15,
        tradeTime,
        note: 'Build position',
      },
      userId,
    )

    expect(result).toBe(createdTransaction)
    expect(ownershipService.validateAccountOwnership).toHaveBeenCalledWith(
      accountId,
      userId,
    )
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: createdTransaction,
      db: txClient,
    })
    expect(txClient.position.create).toHaveBeenCalledWith({
      data: {
        accountId,
        assetId,
        quantity: 10,
        avgCost: 101.5,
        openedAt: new Date(tradeTime),
      },
    })
  })

  it('updates quantity and weighted average cost for an existing position', async () => {
    const { service, txClient, postingService } = createHarness()
    const createdTransaction = buildCreatedTransaction({
      id: 'tx-2',
      amount: 330,
      quantity: 6,
      price: 54,
      fee: 6,
    })

    txClient.transaction.create.mockResolvedValue(createdTransaction)
    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 20,
      avgCost: 50,
    })
    postingService.postTransaction.mockResolvedValue({ id: 'entry-2' })

    await service.create(
      {
        accountId,
        assetId,
        type: 'buy',
        amount: 330,
        quantity: 6,
        price: 54,
        fee: 6,
        tradeTime,
      },
      userId,
    )

    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: {
        quantity: 26,
        avgCost: expect.closeTo(51.1538461538, 10),
      },
    })
  })
})
