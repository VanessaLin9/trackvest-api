import { Prisma, type Transaction } from '@prisma/client'
import { TransactionsService } from './transactions.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionBusinessRulesValidator } from './transaction-business-rules-validator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'

describe('TransactionsService', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const anotherAccountId = 'account-2'
  const assetId = 'asset-1'
  const anotherAssetId = 'asset-2'
  const tradeTime = '2026-03-25T09:30:00.000Z'
  const sellTradeTime = '2026-03-26T09:30:00.000Z'

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
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      position: {
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      positionLot: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      sellLotMatch: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    }

    const prisma = {
      account: {
        findUniqueOrThrow: jest.fn(),
      },
      assetAlias: {
        findUnique: jest.fn(),
      },
      transaction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
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

    const positionReplayService = {
      rebuildScope: jest.fn().mockResolvedValue([]),
    }

    const rebuildPolicy = new TransactionRebuildPolicyService()

    const transactionPositionOrchestrator = new TransactionPositionOrchestratorService(
      positionReplayService as never,
      postingService as never,
      rebuildPolicy,
    )

    const transactionBusinessRulesValidator =
      new TransactionBusinessRulesValidator()

    const service = new TransactionsService(
      prisma as never,
      postingService as never,
      ownershipService as never,
      transactionPositionOrchestrator as never,
      transactionBusinessRulesValidator,
    )

    txClient.transaction.findFirst.mockResolvedValue(null)
    txClient.transaction.findMany.mockResolvedValue([])
    txClient.position.deleteMany.mockResolvedValue({ count: 0 })
    txClient.positionLot.deleteMany.mockResolvedValue({ count: 0 })
    txClient.sellLotMatch.deleteMany.mockResolvedValue({ count: 0 })

    return {
      service,
      prisma,
      txClient,
      postingService,
      ownershipService,
      positionReplayService,
      rebuildPolicy,
      transactionPositionOrchestrator,
      transactionBusinessRulesValidator,
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

  it('consumes the oldest lot first when partially selling from a single open lot', async () => {
    const { service, txClient, postingService } = createHarness()
    const createdTransaction = buildCreatedTransaction({
      id: 'tx-sell-1',
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      tradeTime: new Date(sellTradeTime),
      note: 'Partial sell',
    })

    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 10,
      avgCost: 100,
      openedAt: new Date('2026-03-20T09:30:00.000Z'),
      closedAt: null,
    })
    txClient.positionLot.findMany.mockResolvedValue([
      {
        id: 'lot-1',
        accountId,
        assetId,
        sourceTransactionId: 'buy-1',
        originalQuantity: 10,
        remainingQuantity: 10,
        unitCost: 100,
        openedAt: new Date('2026-03-20T09:30:00.000Z'),
        closedAt: null,
      },
    ])
    txClient.transaction.create.mockResolvedValue(createdTransaction)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-sell-1' })

    const result = await service.create(
      {
        accountId,
        assetId,
        type: 'sell',
        amount: 508,
        quantity: 4,
        price: 130,
        fee: 10,
        tax: 2,
        tradeTime: sellTradeTime,
        note: 'Partial sell',
      },
      userId,
    )

    expect(result).toBe(createdTransaction)
    expect(txClient.positionLot.findMany).toHaveBeenCalledWith({
      where: {
        accountId,
        assetId,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { openedAt: 'asc' },
    })
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'sell',
          quantity: 4,
          price: 130,
        }),
      }),
    )
    expect(txClient.positionLot.update).toHaveBeenCalledWith({
      where: { id: 'lot-1' },
      data: {
        remainingQuantity: 6,
        closedAt: null,
      },
    })
    expect(txClient.sellLotMatch.createMany).toHaveBeenCalledWith({
      data: [
        {
          sellTransactionId: 'tx-sell-1',
          buyLotId: 'lot-1',
          quantity: 4,
          unitCost: 100,
        },
      ],
    })
    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: {
        quantity: 6,
        avgCost: 100,
        closedAt: null,
      },
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: createdTransaction,
      db: txClient,
    })
  })

  it('consumes multiple lots in FIFO order and recalculates the remaining average cost', async () => {
    const { service, txClient, postingService } = createHarness()
    const createdTransaction = buildCreatedTransaction({
      id: 'tx-sell-2',
      type: 'sell',
      amount: 1040,
      quantity: 8,
      price: 132,
      fee: 12,
      tax: 4,
      tradeTime: new Date(sellTradeTime),
      note: 'FIFO sell',
    })

    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 15,
      avgCost: 113.3333333333,
      openedAt: new Date('2026-03-20T09:30:00.000Z'),
      closedAt: null,
    })
    txClient.positionLot.findMany.mockResolvedValue([
      {
        id: 'lot-1',
        accountId,
        assetId,
        sourceTransactionId: 'buy-1',
        originalQuantity: 5,
        remainingQuantity: 5,
        unitCost: 100,
        openedAt: new Date('2026-03-20T09:30:00.000Z'),
        closedAt: null,
      },
      {
        id: 'lot-2',
        accountId,
        assetId,
        sourceTransactionId: 'buy-2',
        originalQuantity: 10,
        remainingQuantity: 10,
        unitCost: 120,
        openedAt: new Date('2026-03-21T09:30:00.000Z'),
        closedAt: null,
      },
    ])
    txClient.transaction.create.mockResolvedValue(createdTransaction)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-sell-2' })

    await service.create(
      {
        accountId,
        assetId,
        type: 'sell',
        amount: 1040,
        quantity: 8,
        price: 132,
        fee: 12,
        tax: 4,
        tradeTime: sellTradeTime,
        note: 'FIFO sell',
      },
      userId,
    )

    expect(txClient.positionLot.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'lot-1' },
      data: {
        remainingQuantity: 0,
        closedAt: new Date(sellTradeTime),
      },
    })
    expect(txClient.positionLot.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'lot-2' },
      data: {
        remainingQuantity: 7,
        closedAt: null,
      },
    })
    expect(txClient.sellLotMatch.createMany).toHaveBeenCalledWith({
      data: [
        {
          sellTransactionId: 'tx-sell-2',
          buyLotId: 'lot-1',
          quantity: 5,
          unitCost: 100,
        },
        {
          sellTransactionId: 'tx-sell-2',
          buyLotId: 'lot-2',
          quantity: 3,
          unitCost: 120,
        },
      ],
    })
    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: {
        quantity: 7,
        avgCost: 120,
        closedAt: null,
      },
    })
  })

  it('rebuilds the scope when creating a backdated buy before later sells', async () => {
    const { service, txClient, postingService, positionReplayService } = createHarness()
    const createdTransaction = buildCreatedTransaction({
      id: 'buy-backfill-1',
      amount: 800,
      quantity: 10,
      price: 80,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-19T09:30:00.000Z'),
      note: 'Backdated buy',
    })
    const laterBuy = buildCreatedTransaction({
      id: 'buy-later-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
    })
    const laterSell = buildCreatedTransaction({
      id: 'sell-later-1',
      type: 'sell',
      amount: 550,
      quantity: 5,
      price: 110,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-21T09:30:00.000Z'),
      account: {
        userId,
      },
    })

    txClient.transaction.findFirst.mockResolvedValue({ id: laterSell.id })
    txClient.transaction.create.mockResolvedValue(createdTransaction)
    txClient.transaction.findMany.mockResolvedValue([
      createdTransaction,
      laterBuy,
      laterSell,
    ])
    positionReplayService.rebuildScope.mockResolvedValue(['sell-later-1'])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-rebuilt-sell' })

    await service.create(
      {
        accountId,
        assetId,
        type: 'buy',
        amount: 800,
        quantity: 10,
        price: 80,
        fee: 0,
        tax: 0,
        tradeTime: '2026-03-19T09:30:00.000Z',
        note: 'Backdated buy',
      },
      userId,
    )

    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(postingService.postTransaction).toHaveBeenNthCalledWith(1, {
      userId,
      transaction: laterSell,
      db: txClient,
    })
    expect(postingService.postTransaction).toHaveBeenNthCalledWith(2, {
      userId,
      transaction: createdTransaction,
      db: txClient,
    })
  })

  it('rebuilds the scope when creating a backdated sell before later buys', async () => {
    const { service, txClient, postingService, positionReplayService } = createHarness()
    const createdTransaction = buildCreatedTransaction({
      id: 'sell-backfill-1',
      type: 'sell',
      amount: 360,
      quantity: 4,
      price: 90,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-21T09:30:00.000Z'),
      note: 'Backdated sell',
    })
    const earlierBuy = buildCreatedTransaction({
      id: 'buy-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
    })
    const laterBuy = buildCreatedTransaction({
      id: 'buy-2',
      amount: 1200,
      quantity: 10,
      price: 120,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-22T09:30:00.000Z'),
    })

    txClient.transaction.findFirst.mockResolvedValue({ id: laterBuy.id })
    txClient.transaction.create.mockResolvedValue(createdTransaction)
    txClient.transaction.findMany.mockResolvedValue([
      earlierBuy,
      createdTransaction,
      laterBuy,
    ])
    positionReplayService.rebuildScope.mockResolvedValue(['sell-backfill-1'])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-backdated-sell' })

    await service.create(
      {
        accountId,
        assetId,
        type: 'sell',
        amount: 360,
        quantity: 4,
        price: 90,
        fee: 0,
        tax: 0,
        tradeTime: '2026-03-21T09:30:00.000Z',
        note: 'Backdated sell',
      },
      userId,
    )

    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(postingService.postTransaction).toHaveBeenCalledTimes(1)
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: createdTransaction,
      db: txClient,
    })
  })

  it('closes the position when a sell fully consumes all remaining lots', async () => {
    const { service, txClient, postingService } = createHarness()
    const createdTransaction = buildCreatedTransaction({
      id: 'tx-sell-3',
      type: 'sell',
      amount: 1485,
      quantity: 15,
      price: 100,
      fee: 10,
      tax: 5,
      tradeTime: new Date(sellTradeTime),
      note: 'Full sell',
    })

    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 15,
      avgCost: 113.3333333333,
      openedAt: new Date('2026-03-20T09:30:00.000Z'),
      closedAt: null,
    })
    txClient.positionLot.findMany.mockResolvedValue([
      {
        id: 'lot-1',
        accountId,
        assetId,
        sourceTransactionId: 'buy-1',
        originalQuantity: 5,
        remainingQuantity: 5,
        unitCost: 100,
        openedAt: new Date('2026-03-20T09:30:00.000Z'),
        closedAt: null,
      },
      {
        id: 'lot-2',
        accountId,
        assetId,
        sourceTransactionId: 'buy-2',
        originalQuantity: 10,
        remainingQuantity: 10,
        unitCost: 120,
        openedAt: new Date('2026-03-21T09:30:00.000Z'),
        closedAt: null,
      },
    ])
    txClient.transaction.create.mockResolvedValue(createdTransaction)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-sell-3' })

    await service.create(
      {
        accountId,
        assetId,
        type: 'sell',
        amount: 1485,
        quantity: 15,
        price: 100,
        fee: 10,
        tax: 5,
        tradeTime: sellTradeTime,
        note: 'Full sell',
      },
      userId,
    )

    expect(txClient.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: {
        quantity: 0,
        avgCost: 0,
        closedAt: new Date(sellTradeTime),
      },
    })
  })

  it('rejects a sell when the requested quantity exceeds the remaining open lots', async () => {
    const { service, txClient, postingService } = createHarness()

    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 5,
      avgCost: 100,
      openedAt: new Date('2026-03-20T09:30:00.000Z'),
      closedAt: null,
    })
    txClient.positionLot.findMany.mockResolvedValue([
      {
        id: 'lot-1',
        accountId,
        assetId,
        sourceTransactionId: 'buy-1',
        originalQuantity: 5,
        remainingQuantity: 5,
        unitCost: 100,
        openedAt: new Date('2026-03-20T09:30:00.000Z'),
        closedAt: null,
      },
    ])

    await expect(
      service.create(
        {
          accountId,
          assetId,
          type: 'sell',
          amount: 780,
          quantity: 6,
          price: 130,
          fee: 0,
          tax: 0,
          tradeTime: sellTradeTime,
          note: 'Oversell',
        },
        userId,
      ),
    ).rejects.toThrow('sell quantity exceeds the remaining open position lots')

    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(txClient.sellLotMatch.createMany).not.toHaveBeenCalled()
    expect(txClient.position.update).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('rejects a sell when there is no active position for the asset', async () => {
    const { service, txClient, postingService } = createHarness()

    txClient.position.findFirst.mockResolvedValue(null)

    await expect(
      service.create(
        {
          accountId,
          assetId,
          type: 'sell',
          amount: 520,
          quantity: 4,
          price: 130,
          fee: 0,
          tax: 0,
          tradeTime: sellTradeTime,
          note: 'No active position',
        },
        userId,
      ),
    ).rejects.toThrow('Active position not found for sell transaction')

    expect(txClient.positionLot.findMany).not.toHaveBeenCalled()
    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(txClient.sellLotMatch.createMany).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('recalculates position and reposts GL when a buy transaction is updated', async () => {
    const { service, prisma, txClient, postingService, ownershipService, positionReplayService } =
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
    txClient.transaction.findMany.mockResolvedValue([updatedTransaction])
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
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(txClient.position.update).not.toHaveBeenCalled()
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: updatedTransaction,
      db: txClient,
    })
  })

  it('archives GL and closes the position when removing the last buy transaction', async () => {
    const { service, txClient, postingService, ownershipService, positionReplayService } =
      createHarness()
    const removedTransaction = buildCreatedTransaction({
      isDeleted: true,
      deletedAt: new Date('2026-03-25T10:00:00.000Z'),
    })

    txClient.transaction.update.mockResolvedValue(removedTransaction)
    txClient.transaction.findMany.mockResolvedValue([])

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
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(txClient.position.update).not.toHaveBeenCalled()
  })

  it('archives GL and closes the position when hard deleting the last buy transaction', async () => {
    const { service, txClient, postingService, ownershipService, positionReplayService } =
      createHarness()
    const existingTransaction = buildCreatedTransaction()

    txClient.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.delete.mockResolvedValue(existingTransaction)
    txClient.transaction.findMany.mockResolvedValue([])

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
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(txClient.position.update).not.toHaveBeenCalled()
  })

  it('reduces quantity and keeps the position open when removing a non-final buy transaction', async () => {
    const { service, txClient, postingService, positionReplayService } = createHarness()
    const removedTransaction = buildCreatedTransaction({
      amount: 330,
      quantity: 6,
      price: 54,
      fee: 6,
      isDeleted: true,
      deletedAt: new Date('2026-03-25T10:00:00.000Z'),
    })
    const remainingBuy = buildCreatedTransaction({
      id: 'buy-2',
      amount: 1000,
      quantity: 20,
      price: 50,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-26T09:30:00.000Z'),
    })

    txClient.transaction.update.mockResolvedValue(removedTransaction)
    txClient.transaction.findMany.mockResolvedValue([remainingBuy])

    await service.remove('tx-1', userId)

    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-1',
      txClient,
    )
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(txClient.position.update).not.toHaveBeenCalled()
  })

  it('reduces quantity and keeps the position open when hard deleting a non-final buy transaction', async () => {
    const { service, txClient, postingService, positionReplayService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      amount: 330,
      quantity: 6,
      price: 54,
      fee: 6,
    })
    const remainingBuy = buildCreatedTransaction({
      id: 'buy-2',
      amount: 1000,
      quantity: 20,
      price: 50,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-26T09:30:00.000Z'),
    })

    txClient.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.delete.mockResolvedValue(existingTransaction)
    txClient.transaction.findMany.mockResolvedValue([remainingBuy])

    await service.hardDelete('tx-1', userId)

    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-1',
      txClient,
    )
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(txClient.position.update).not.toHaveBeenCalled()
  })

  it('moves holdings when a buy transaction is updated to a different account and asset', async () => {
    const { service, prisma, txClient, postingService, positionReplayService } =
      createHarness()
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
    txClient.transaction.findMany.mockResolvedValue([movedTransaction])
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

    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId: anotherAccountId,
      assetId: anotherAssetId,
    })
    expect(txClient.position.update).not.toHaveBeenCalled()
    expect(txClient.position.create).not.toHaveBeenCalled()
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: movedTransaction,
      db: txClient,
    })
  })

  it('rebuilds FIFO lots and reposts sells when updating a buy that is before later sells', async () => {
    const { service, prisma, txClient, postingService, positionReplayService } =
      createHarness()
    const existingTransaction = buildCreatedTransaction({
      id: 'buy-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      note: 'Original buy',
    })
    const updatedTransaction = buildCreatedTransaction({
      id: 'buy-1',
      amount: 900,
      quantity: 10,
      price: 90,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      note: 'Updated buy',
      account: {
        userId,
      },
    })
    const laterSell = buildCreatedTransaction({
      id: 'sell-1',
      type: 'sell',
      amount: 440,
      quantity: 4,
      price: 110,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-21T09:30:00.000Z'),
      account: {
        userId,
      },
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.update.mockResolvedValue(updatedTransaction)
    txClient.transaction.findFirst.mockResolvedValue({ id: laterSell.id })
    txClient.transaction.findMany.mockResolvedValue([
      updatedTransaction,
      laterSell,
    ])
    positionReplayService.rebuildScope.mockResolvedValue(['sell-1'])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-updated' })

    await service.update(
      'buy-1',
      {
        amount: 900,
        quantity: 10,
        price: 90,
        fee: 0,
        tradeTime: '2026-03-20T09:30:00.000Z',
        note: 'Updated buy',
      },
      userId,
    )

    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(postingService.postTransaction).toHaveBeenNthCalledWith(1, {
      userId,
      transaction: laterSell,
      db: txClient,
    })
    expect(postingService.postTransaction).toHaveBeenNthCalledWith(2, {
      userId,
      transaction: updatedTransaction,
      db: txClient,
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

  it('rebuilds FIFO lots and reposts sell GL when updating a sell transaction', async () => {
    const { service, prisma, txClient, postingService, positionReplayService } =
      createHarness()
    const buyTransaction = buildCreatedTransaction({
      id: 'buy-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      note: 'Initial buy',
    })
    const existingTransaction = buildCreatedTransaction({
      id: 'tx-sell-1',
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      tradeTime: new Date(sellTradeTime),
    })
    const updatedTransaction = buildCreatedTransaction({
      id: 'tx-sell-1',
      type: 'sell',
      amount: 390,
      quantity: 3,
      price: 130,
      fee: 0,
      tax: 0,
      tradeTime: new Date(sellTradeTime),
      note: 'Updated sell',
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.update.mockResolvedValue(updatedTransaction)
    txClient.transaction.findMany.mockResolvedValue([
      buyTransaction,
      updatedTransaction,
    ])
    txClient.position.deleteMany.mockResolvedValue({ count: 1 })
    txClient.positionLot.deleteMany.mockResolvedValue({ count: 1 })
    txClient.sellLotMatch.deleteMany.mockResolvedValue({ count: 1 })
    positionReplayService.rebuildScope.mockResolvedValue(['tx-sell-1'])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-sell-1' })

    await service.update(
      'tx-sell-1',
      {
        amount: 390,
        quantity: 3,
        fee: 0,
        tax: 0,
        tradeTime: sellTradeTime,
        note: 'Updated sell',
      },
      userId,
    )

    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: updatedTransaction,
      db: txClient,
    })
  })

  it('rejects changing a buy transaction into sell', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      id: 'buy-1',
      type: 'buy',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)

    await expect(
      service.update(
        'buy-1',
        {
          type: 'sell',
          amount: 500,
          quantity: 5,
          price: 100,
          fee: 0,
          tax: 0,
          tradeTime,
        },
        userId,
      ),
    ).rejects.toThrow('Changing a transaction into or out of sell is not supported')

    expect(txClient.transaction.update).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('rejects changing a sell transaction into buy', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      id: 'sell-1',
      type: 'sell',
      amount: 500,
      quantity: 5,
      price: 100,
      fee: 0,
      tax: 0,
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)

    await expect(
      service.update(
        'sell-1',
        {
          type: 'buy',
          amount: 500,
          quantity: 5,
          price: 100,
          fee: 0,
          tax: 0,
          tradeTime,
        },
        userId,
      ),
    ).rejects.toThrow('Changing a transaction into or out of sell is not supported')

    expect(txClient.transaction.update).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
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

  it('rebuilds FIFO lots and restores the position when removing a sell transaction', async () => {
    const { service, txClient, postingService } = createHarness()
    const buyTransaction = buildCreatedTransaction({
      id: 'buy-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      note: 'Initial buy',
    })
    const removedTransaction = buildCreatedTransaction({
      id: 'tx-sell-1',
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      tradeTime: new Date(sellTradeTime),
      isDeleted: true,
      deletedAt: new Date('2026-03-27T10:00:00.000Z'),
      account: {
        userId,
      },
    })

    txClient.transaction.findUnique.mockResolvedValue({
      type: 'sell',
    })
    txClient.transaction.update.mockResolvedValue(removedTransaction)
    txClient.transaction.findMany.mockResolvedValue([
      buyTransaction,
      removedTransaction,
    ])
    txClient.position.deleteMany.mockResolvedValue({ count: 1 })
    txClient.position.create.mockResolvedValue({
      id: 'rebuilt-position',
      accountId,
      assetId,
      quantity: 10,
      avgCost: 100,
      openedAt: buyTransaction.tradeTime,
      closedAt: null,
    })
    txClient.positionLot.deleteMany.mockResolvedValue({ count: 1 })
    txClient.positionLot.create.mockResolvedValue({
      id: 'lot-1',
    })
    txClient.sellLotMatch.deleteMany.mockResolvedValue({ count: 1 })

    await service.remove('tx-sell-1', userId)

    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-sell-1',
      txClient,
    )
    expect(txClient.sellLotMatch.createMany).not.toHaveBeenCalled()
    expect(txClient.positionLot.update).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('rebuilds FIFO lots and reposts sells when removing a buy that is before later sells', async () => {
    const { service, txClient, postingService, positionReplayService } = createHarness()
    const removedTransaction = buildCreatedTransaction({
      id: 'buy-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      isDeleted: true,
      deletedAt: new Date('2026-03-27T10:00:00.000Z'),
      account: {
        userId,
      },
    })
    const laterBuy = buildCreatedTransaction({
      id: 'buy-2',
      amount: 900,
      quantity: 10,
      price: 90,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-22T09:30:00.000Z'),
    })
    const laterSell = buildCreatedTransaction({
      id: 'sell-1',
      type: 'sell',
      amount: 440,
      quantity: 4,
      price: 110,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-23T09:30:00.000Z'),
      account: {
        userId,
      },
    })

    txClient.transaction.findUnique.mockResolvedValue({
      ...removedTransaction,
      isDeleted: false,
      deletedAt: null,
    })
    txClient.transaction.update.mockResolvedValue(removedTransaction)
    txClient.transaction.findFirst.mockResolvedValue({ id: laterSell.id })
    txClient.transaction.findMany.mockResolvedValue([
      removedTransaction,
      laterBuy,
      laterSell,
    ])
    positionReplayService.rebuildScope.mockResolvedValue(['sell-1'])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-reposted-sell' })

    await service.remove('buy-1', userId)

    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'buy-1',
      txClient,
    )
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: laterSell,
      db: txClient,
    })
  })

  it('rebuilds FIFO lots and restores the position when hard deleting a sell transaction', async () => {
    const { service, txClient, postingService } = createHarness()
    const buyTransaction = buildCreatedTransaction({
      id: 'buy-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      note: 'Initial buy',
      account: {
        userId,
      },
    })
    const existingTransaction = buildCreatedTransaction({
      id: 'tx-sell-1',
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      tradeTime: new Date(sellTradeTime),
    })

    txClient.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.delete.mockResolvedValue(existingTransaction)
    txClient.transaction.findMany.mockResolvedValue([buyTransaction])
    txClient.position.deleteMany.mockResolvedValue({ count: 1 })
    txClient.position.create.mockResolvedValue({
      id: 'rebuilt-position',
      accountId,
      assetId,
      quantity: 10,
      avgCost: 100,
      openedAt: buyTransaction.tradeTime,
      closedAt: null,
    })
    txClient.positionLot.deleteMany.mockResolvedValue({ count: 1 })
    txClient.positionLot.create.mockResolvedValue({
      id: 'lot-1',
    })
    txClient.sellLotMatch.deleteMany.mockResolvedValue({ count: 1 })

    await service.hardDelete('tx-sell-1', userId)

    expect(txClient.transaction.delete).toHaveBeenCalledWith({
      where: { id: 'tx-sell-1' },
    })
    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-sell-1',
      txClient,
    )
    expect(txClient.sellLotMatch.createMany).not.toHaveBeenCalled()
    expect(txClient.positionLot.update).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('rebuilds FIFO lots and reposts sells when hard deleting a buy that is before later sells', async () => {
    const { service, txClient, postingService, positionReplayService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      id: 'buy-1',
      amount: 1000,
      quantity: 10,
      price: 100,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      account: {
        userId,
      },
    })
    const laterBuy = buildCreatedTransaction({
      id: 'buy-2',
      amount: 900,
      quantity: 10,
      price: 90,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-22T09:30:00.000Z'),
    })
    const laterSell = buildCreatedTransaction({
      id: 'sell-1',
      type: 'sell',
      amount: 440,
      quantity: 4,
      price: 110,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-23T09:30:00.000Z'),
      account: {
        userId,
      },
    })

    txClient.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.findFirst.mockResolvedValue({ id: laterSell.id })
    txClient.transaction.delete.mockResolvedValue(existingTransaction)
    txClient.transaction.findMany.mockResolvedValue([
      laterBuy,
      laterSell,
    ])
    positionReplayService.rebuildScope.mockResolvedValue(['sell-1'])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-reposted-sell' })

    await service.hardDelete('buy-1', userId)

    expect(txClient.transaction.delete).toHaveBeenCalledWith({
      where: { id: 'buy-1' },
    })
    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'buy-1',
      txClient,
    )
    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: laterSell,
      db: txClient,
    })
  })

  it('reconciles buy updates through scope rebuild instead of incremental position guards', async () => {
    const { service, prisma, txClient, postingService, positionReplayService } =
      createHarness()
    const existingTransaction = buildCreatedTransaction()
    const updatedTransaction = buildCreatedTransaction({
      amount: 100,
      quantity: 1,
      price: 100,
      fee: 0,
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.update.mockResolvedValue(updatedTransaction)
    txClient.transaction.findMany.mockResolvedValue([updatedTransaction])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-5' })

    await service.update(
      'tx-1',
      {
        amount: 100,
        quantity: 1,
        price: 100,
        fee: 0,
        tradeTime,
      },
      userId,
    )

    expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
      accountId,
      assetId,
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: updatedTransaction,
      db: txClient,
    })
  })

  /*
   * P3 rebuild-policy characterization inventory:
   * - out-of-order buy: covered by "backdated buy before later sells" (unit + e2e)
   * - out-of-order sell: covered by "backdated sell before later buys" (unit + e2e)
   * - sell update: covered by "rebuilds FIFO lots and reposts sell GL when updating a sell" (unit + e2e)
   * - buy delete before existing sell: covered by remove/hardDelete buy before later sells (unit + e2e)
   * - hard delete sell: covered by hard deleting sell transaction specs (unit + e2e)
   * Policy decision tests live in transaction-rebuild-policy.service.spec.ts (commit 2).
   */
  describe('create transaction boundary (CP0 characterization)', () => {
    it('runs ownership and business validation outside one transaction, then create/position/GL on the same tx client', async () => {
      const {
        service,
        prisma,
        txClient,
        postingService,
        ownershipService,
        transactionPositionOrchestrator,
        transactionBusinessRulesValidator,
      } = createHarness()
      const createdTransaction = buildCreatedTransaction()
      const prepareSpy = jest.spyOn(
        transactionPositionOrchestrator,
        'prepareCreateSideEffects',
      )
      const applySpy = jest.spyOn(
        transactionPositionOrchestrator,
        'applyCreateSideEffects',
      )
      const businessValidateSpy = jest.spyOn(
        transactionBusinessRulesValidator,
        'validate',
      )

      txClient.transaction.create.mockResolvedValue(createdTransaction)
      txClient.position.findFirst.mockResolvedValue(null)
      postingService.postTransaction.mockResolvedValue({ id: 'entry-cp0-1' })

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
          note: 'CP0 boundary',
        },
        userId,
      )

      expect(result).toBe(createdTransaction)
      expect(ownershipService.validateAccountOwnership).toHaveBeenCalledTimes(1)
      expect(ownershipService.validateAccountOwnership).toHaveBeenCalledWith(
        accountId,
        userId,
      )
      expect(businessValidateSpy).toHaveBeenCalledTimes(1)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)

      const ownershipOrder =
        ownershipService.validateAccountOwnership.mock.invocationCallOrder[0]
      const businessOrder = businessValidateSpy.mock.invocationCallOrder[0]
      const transactionOrder = prisma.$transaction.mock.invocationCallOrder[0]
      expect(ownershipOrder).toBeLessThan(businessOrder)
      expect(businessOrder).toBeLessThan(transactionOrder)

      expect(prepareSpy).toHaveBeenCalledWith(
        txClient,
        expect.objectContaining({
          accountId,
          assetId,
          type: 'buy',
          quantity: 10,
        }),
      )
      expect(txClient.transaction.create).toHaveBeenCalledTimes(1)
      expect(prisma.transaction.create).not.toHaveBeenCalled()
      expect(applySpy).toHaveBeenCalledWith(
        txClient,
        createdTransaction,
        expect.anything(),
      )
      expect(txClient.position.create).toHaveBeenCalled()
      expect(postingService.postTransaction).toHaveBeenCalledWith({
        userId,
        transaction: createdTransaction,
        db: txClient,
      })
      expect(postingService.postTransaction.mock.calls[0][0].db).toBe(txClient)
    })

    it('does not open a prisma transaction when account ownership validation fails', async () => {
      const {
        service,
        prisma,
        txClient,
        postingService,
        ownershipService,
        transactionBusinessRulesValidator,
      } = createHarness()
      const businessValidateSpy = jest.spyOn(
        transactionBusinessRulesValidator,
        'validate',
      )

      ownershipService.validateAccountOwnership.mockRejectedValue(
        new Error('You do not have access to this account'),
      )

      await expect(
        service.create(
          {
            accountId,
            assetId,
            type: 'buy',
            amount: 1015,
            quantity: 10,
            price: 100,
            fee: 15,
            tradeTime,
          },
          userId,
        ),
      ).rejects.toThrow('You do not have access to this account')

      expect(ownershipService.validateAccountOwnership).toHaveBeenCalledTimes(1)
      expect(businessValidateSpy).not.toHaveBeenCalled()
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(txClient.transaction.create).not.toHaveBeenCalled()
      expect(postingService.postTransaction).not.toHaveBeenCalled()
    })

    it('does not open a prisma transaction when business validation fails', async () => {
      const {
        service,
        prisma,
        txClient,
        postingService,
        ownershipService,
        transactionBusinessRulesValidator,
      } = createHarness()
      const businessValidateSpy = jest.spyOn(
        transactionBusinessRulesValidator,
        'validate',
      )

      await expect(
        service.create(
          {
            accountId,
            assetId,
            type: 'buy',
            amount: 0,
            quantity: 10,
            price: 100,
            fee: 15,
            tradeTime,
          },
          userId,
        ),
      ).rejects.toThrow(/amount/i)

      expect(ownershipService.validateAccountOwnership).toHaveBeenCalledTimes(1)
      expect(businessValidateSpy).toHaveBeenCalledTimes(1)
      expect(
        ownershipService.validateAccountOwnership.mock.invocationCallOrder[0],
      ).toBeLessThan(businessValidateSpy.mock.invocationCallOrder[0])
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(txClient.transaction.create).not.toHaveBeenCalled()
      expect(postingService.postTransaction).not.toHaveBeenCalled()
    })

    it('rejects the create transaction when GL posting fails', async () => {
      const { service, prisma, txClient, postingService } = createHarness()
      const createdTransaction = buildCreatedTransaction({ id: 'tx-cp0-post-fail' })

      txClient.transaction.create.mockResolvedValue(createdTransaction)
      txClient.position.findFirst.mockResolvedValue(null)
      postingService.postTransaction.mockRejectedValue(
        new Error('GL posting failed'),
      )

      await expect(
        service.create(
          {
            accountId,
            assetId,
            type: 'buy',
            amount: 1015,
            quantity: 10,
            price: 100,
            fee: 15,
            tradeTime,
          },
          userId,
        ),
      ).rejects.toThrow('GL posting failed')

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(txClient.transaction.create).toHaveBeenCalledTimes(1)
      expect(postingService.postTransaction).toHaveBeenCalledWith({
        userId,
        transaction: createdTransaction,
        db: txClient,
      })
    })
  })

  describe('createInTransaction core (CP1)', () => {
    it('public create still opens exactly one prisma transaction and delegates to the core', async () => {
      const { service, prisma, txClient, postingService } = createHarness()
      const createdTransaction = buildCreatedTransaction({ id: 'tx-cp1-public' })
      const coreSpy = jest.spyOn(service, 'createInTransaction')

      txClient.transaction.create.mockResolvedValue(createdTransaction)
      txClient.position.findFirst.mockResolvedValue(null)
      postingService.postTransaction.mockResolvedValue({ id: 'entry-cp1-public' })

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
        },
        userId,
      )

      expect(result).toBe(createdTransaction)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(coreSpy).toHaveBeenCalledTimes(1)
      expect(coreSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          assetId,
          type: 'buy',
        }),
        txClient,
      )
    })

    it('createInTransaction does not open its own prisma transaction', async () => {
      const {
        service,
        prisma,
        txClient,
        postingService,
        transactionPositionOrchestrator,
      } = createHarness()
      const createdTransaction = buildCreatedTransaction({ id: 'tx-cp1-core' })
      const prepareSpy = jest.spyOn(
        transactionPositionOrchestrator,
        'prepareCreateSideEffects',
      )
      const applySpy = jest.spyOn(
        transactionPositionOrchestrator,
        'applyCreateSideEffects',
      )

      txClient.transaction.create.mockResolvedValue(createdTransaction)
      txClient.position.findFirst.mockResolvedValue(null)
      postingService.postTransaction.mockResolvedValue({ id: 'entry-cp1-core' })

      const result = await service.createInTransaction(
        {
          accountId,
          assetId,
          type: 'buy',
          amount: 1015,
          quantity: 10,
          price: 100,
          fee: 15,
          tradeTime,
        },
        txClient as never,
      )

      expect(result).toBe(createdTransaction)
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(prepareSpy).toHaveBeenCalledWith(txClient, expect.any(Object))
      expect(applySpy).toHaveBeenCalledWith(
        txClient,
        createdTransaction,
        expect.anything(),
      )
      expect(txClient.transaction.create).toHaveBeenCalledTimes(1)
      expect(prisma.transaction.create).not.toHaveBeenCalled()
      expect(postingService.postTransaction).toHaveBeenCalledWith({
        userId,
        transaction: createdTransaction,
        db: txClient,
      })
      expect(postingService.postTransaction.mock.calls[0][0].db).toBe(txClient)
    })

    it('createInTransaction skips primary GL post when side effects request it', async () => {
      const { service, prisma, txClient, postingService, positionReplayService } =
        createHarness()
      const createdTransaction = buildCreatedTransaction({
        id: 'sell-cp1-skip-primary',
        type: 'sell',
        amount: 360,
        quantity: 4,
        price: 90,
        fee: 0,
        tax: 0,
        tradeTime: new Date('2026-03-21T09:30:00.000Z'),
      })
      const earlierBuy = buildCreatedTransaction({
        id: 'buy-cp1-1',
        amount: 1000,
        quantity: 10,
        price: 100,
        fee: 0,
        tax: 0,
        tradeTime: new Date('2026-03-20T09:30:00.000Z'),
      })
      const laterBuy = buildCreatedTransaction({
        id: 'buy-cp1-2',
        amount: 1200,
        quantity: 10,
        price: 120,
        fee: 0,
        tax: 0,
        tradeTime: new Date('2026-03-22T09:30:00.000Z'),
      })

      txClient.transaction.findFirst.mockResolvedValue({ id: laterBuy.id })
      txClient.transaction.create.mockResolvedValue(createdTransaction)
      txClient.transaction.findMany.mockResolvedValue([
        earlierBuy,
        createdTransaction,
        laterBuy,
      ])
      positionReplayService.rebuildScope.mockResolvedValue(['sell-cp1-skip-primary'])
      postingService.postTransaction.mockResolvedValue({ id: 'entry-cp1-rebuild' })

      await service.createInTransaction(
        {
          accountId,
          assetId,
          type: 'sell',
          amount: 360,
          quantity: 4,
          price: 90,
          fee: 0,
          tax: 0,
          tradeTime: '2026-03-21T09:30:00.000Z',
        },
        txClient as never,
      )

      expect(prisma.$transaction).not.toHaveBeenCalled()
      // Rebuild reposts the sell; primary create-path GL post is skipped.
      expect(postingService.postTransaction).toHaveBeenCalledTimes(1)
      expect(postingService.postTransaction).toHaveBeenCalledWith({
        userId,
        transaction: createdTransaction,
        db: txClient,
      })
    })

    it('createInTransaction rejects when a create-side collaborator fails', async () => {
      const { service, prisma, txClient, postingService } = createHarness()
      const createdTransaction = buildCreatedTransaction({ id: 'tx-cp1-fail' })

      txClient.transaction.create.mockResolvedValue(createdTransaction)
      txClient.position.findFirst.mockResolvedValue(null)
      postingService.postTransaction.mockRejectedValue(new Error('GL posting failed'))

      await expect(
        service.createInTransaction(
          {
            accountId,
            assetId,
            type: 'buy',
            amount: 1015,
            quantity: 10,
            price: 100,
            fee: 15,
            tradeTime,
          },
          txClient as never,
        ),
      ).rejects.toThrow('GL posting failed')

      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(txClient.transaction.create).toHaveBeenCalledTimes(1)
    })
  })

  /*
   * P2 side-effect characterization inventory (create/update/remove/hardDelete):
   * - create buy: position create/update covered; incremental PositionLot create covered below.
   * - create sell: FIFO plan, rebuild, reject paths covered above.
   * - update/remove/hardDelete: buy/sell rebuild, deposit noop, P1 regression covered above.
   * - import: goes through create(); out of P2 extraction scope.
   */
  describe('incremental buy create side effects (P2 characterization)', () => {
    it('creates a matching PositionLot when opening the first buy in a scope', async () => {
      const { service, txClient } = createHarness()
      const createdTransaction = buildCreatedTransaction()

      txClient.transaction.create.mockResolvedValue(createdTransaction)
      txClient.position.findFirst.mockResolvedValue(null)

      await service.create(
        {
          accountId,
          assetId,
          type: 'buy',
          amount: 1015,
          quantity: 10,
          price: 100,
          fee: 15,
          tradeTime,
        },
        userId,
      )

      expect(txClient.positionLot.create).toHaveBeenCalledWith({
        data: {
          accountId,
          assetId,
          sourceTransactionId: createdTransaction.id,
          originalQuantity: 10,
          remainingQuantity: 10,
          unitCost: 101.5,
          openedAt: new Date(tradeTime),
        },
      })
    })

    it('creates a new PositionLot when incrementally adding another buy to an open position', async () => {
      const { service, txClient } = createHarness()
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

      expect(txClient.positionLot.create).toHaveBeenCalledWith({
        data: {
          accountId,
          assetId,
          sourceTransactionId: createdTransaction.id,
          originalQuantity: 6,
          remainingQuantity: 6,
          unitCost: 55,
          openedAt: new Date(tradeTime),
        },
      })
    })
  })

  /*
   * P1 regression inventory (buy mutation without later sells):
   * - Existing tests at ~749/800/870 only assert Position.update, not PositionLot sync.
   * - Existing tests with later sells (~1350/1472) already expect rebuildScope.
   * - Tests below assert the target behavior: rebuildScope instead of incremental Position-only patches.
   */
  describe('buy mutation scope rebuild regression (P1)', () => {
    it('rebuilds scope when updating a buy transaction with no later sells', async () => {
      const { service, prisma, txClient, postingService, positionReplayService } =
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
      txClient.transaction.findMany.mockResolvedValue([updatedTransaction])
      txClient.position.findFirst.mockResolvedValue({
        id: 'position-1',
        quantity: 10,
        avgCost: 101.5,
      })
      postingService.postTransaction.mockResolvedValue({ id: 'entry-updated-buy' })

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

      expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
        accountId,
        assetId,
      })
      expect(txClient.position.update).not.toHaveBeenCalled()
      expect(postingService.postTransaction).toHaveBeenCalledWith({
        userId,
        transaction: updatedTransaction,
        db: txClient,
      })
    })

    it('rebuilds scope when soft deleting a buy transaction with no later sells', async () => {
      const { service, txClient, postingService, positionReplayService } =
        createHarness()
      const removedTransaction = buildCreatedTransaction({
        isDeleted: true,
        deletedAt: new Date('2026-03-25T10:00:00.000Z'),
      })

      txClient.transaction.update.mockResolvedValue(removedTransaction)
      txClient.transaction.findMany.mockResolvedValue([])
      txClient.position.findFirst.mockResolvedValue({
        id: 'position-1',
        quantity: 10,
        avgCost: 101.5,
      })

      await service.remove('tx-1', userId)

      expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
        accountId,
        assetId,
      })
      expect(txClient.position.update).not.toHaveBeenCalled()
      expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
        userId,
        'tx-1',
        txClient,
      )
    })

    it('rebuilds scope when hard deleting a buy transaction with no later sells', async () => {
      const { service, txClient, postingService, positionReplayService } =
        createHarness()
      const existingTransaction = buildCreatedTransaction()

      txClient.transaction.findUnique.mockResolvedValue(existingTransaction)
      txClient.transaction.delete.mockResolvedValue(existingTransaction)
      txClient.transaction.findMany.mockResolvedValue([])
      txClient.position.findFirst.mockResolvedValue({
        id: 'position-1',
        quantity: 10,
        avgCost: 101.5,
      })

      await service.hardDelete('tx-1', userId)

      expect(positionReplayService.rebuildScope).toHaveBeenCalledWith(txClient, {
        accountId,
        assetId,
      })
      expect(txClient.position.update).not.toHaveBeenCalled()
      expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
        userId,
        'tx-1',
        txClient,
      )
    })
  })
})
