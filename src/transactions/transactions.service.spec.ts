import type { Prisma, Transaction } from '@prisma/client'
import { TransactionsService } from './transactions.service'

describe('TransactionsService', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const anotherAccountId = 'account-2'
  const assetId = 'asset-1'
  const anotherAssetId = 'asset-2'
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
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      position: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    }

    const prisma = {
      transaction: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(
        async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          callback(txClient as unknown as Prisma.TransactionClient),
      ),
    }

    const postingService = {
      postTransaction: jest.fn(),
      archiveTransactionEntries: jest.fn(),
    }

    const ownershipService = {
      validateAccountOwnership: jest.fn(),
      validateTransactionOwnership: jest.fn(),
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

  it('recalculates position and reposts GL when a buy transaction is updated', async () => {
    const { service, prisma, txClient, postingService, ownershipService } =
      createHarness()
    const existingTransaction = buildCreatedTransaction()
    const updatedTransaction = buildCreatedTransaction({
      amount: 330,
      quantity: 6,
      price: 54,
      fee: 6,
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.update.mockResolvedValue(updatedTransaction)
    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 10,
      avgCost: 101.5,
    })
    postingService.postTransaction.mockResolvedValue({ id: 'entry-2' })

    await service.update(
      'tx-1',
      {
        amount: 330,
        quantity: 6,
        price: 54,
        fee: 6,
        tradeTime,
      },
      userId,
    )

    expect(ownershipService.validateTransactionOwnership).toHaveBeenCalledWith(
      'tx-1',
      userId,
    )
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: updatedTransaction,
      db: txClient,
    })
    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: {
        quantity: 6,
        avgCost: 55,
        closedAt: null,
      },
    })
  })

  it('archives GL and closes the position when removing the last buy transaction', async () => {
    const { service, txClient, postingService, ownershipService } =
      createHarness()
    const removedTransaction = buildCreatedTransaction({
      isDeleted: true,
      deletedAt: new Date('2026-03-25T10:00:00.000Z'),
    })

    txClient.transaction.update.mockResolvedValue(removedTransaction)
    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 10,
      avgCost: 101.5,
    })

    await service.remove('tx-1', userId)

    expect(ownershipService.validateTransactionOwnership).toHaveBeenCalledWith(
      'tx-1',
      userId,
    )
    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-1',
      txClient,
    )
    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: {
        quantity: 0,
        avgCost: 0,
        closedAt: removedTransaction.tradeTime,
      },
    })
  })

  it('archives GL and closes the position when hard deleting the last buy transaction', async () => {
    const { service, txClient, postingService, ownershipService } =
      createHarness()
    const existingTransaction = buildCreatedTransaction()

    txClient.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.delete.mockResolvedValue(existingTransaction)
    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 10,
      avgCost: 101.5,
    })

    await service.hardDelete('tx-1', userId)

    expect(ownershipService.validateTransactionOwnership).toHaveBeenCalledWith(
      'tx-1',
      userId,
    )
    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-1',
      txClient,
    )
    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: {
        quantity: 0,
        avgCost: 0,
        closedAt: existingTransaction.tradeTime,
      },
    })
  })

  it('moves holdings when a buy transaction is updated to a different account and asset', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction()
    const movedTransaction = buildCreatedTransaction({
      accountId: anotherAccountId,
      assetId: anotherAssetId,
      amount: 330,
      quantity: 6,
      price: 54,
      fee: 6,
      account: {
        userId,
      },
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.update.mockResolvedValue(movedTransaction)
    txClient.position.findFirst
      .mockResolvedValueOnce({
        id: 'old-position',
        quantity: 10,
        avgCost: 101.5,
      })
      .mockResolvedValueOnce(null)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-3' })

    await service.update(
      'tx-1',
      {
        accountId: anotherAccountId,
        assetId: anotherAssetId,
        amount: 330,
        quantity: 6,
        price: 54,
        fee: 6,
        tradeTime,
      },
      userId,
    )

    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'old-position' },
      data: {
        quantity: 0,
        avgCost: 0,
        closedAt: existingTransaction.tradeTime,
      },
    })
    expect(txClient.position.create).toHaveBeenCalledWith({
      data: {
        accountId: anotherAccountId,
        assetId: anotherAssetId,
        quantity: 6,
        avgCost: 55,
        openedAt: movedTransaction.tradeTime,
      },
    })
  })

  it('does not touch positions when updating a non-buy transaction', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      type: 'deposit',
      assetId: null,
      quantity: null,
      price: null,
      fee: 0,
      tax: 0,
      amount: 1000,
    })
    const updatedTransaction = buildCreatedTransaction({
      type: 'deposit',
      assetId: null,
      quantity: null,
      price: null,
      fee: 0,
      tax: 0,
      amount: 1200,
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.update.mockResolvedValue(updatedTransaction)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-4' })

    await service.update(
      'tx-1',
      {
        amount: 1200,
        tradeTime,
      },
      userId,
    )

    expect(txClient.position.findFirst).not.toHaveBeenCalled()
    expect(txClient.position.create).not.toHaveBeenCalled()
    expect(txClient.position.update).not.toHaveBeenCalled()
  })

  it('does not touch positions when removing a non-buy transaction', async () => {
    const { service, txClient, postingService } = createHarness()
    const removedTransaction = buildCreatedTransaction({
      type: 'deposit',
      assetId: null,
      quantity: null,
      price: null,
      fee: 0,
      tax: 0,
      amount: 1000,
      isDeleted: true,
      deletedAt: new Date('2026-03-25T10:00:00.000Z'),
    })

    txClient.transaction.update.mockResolvedValue(removedTransaction)

    await service.remove('tx-1', userId)

    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-1',
      txClient,
    )
    expect(txClient.position.findFirst).not.toHaveBeenCalled()
    expect(txClient.position.update).not.toHaveBeenCalled()
  })
})
