import { Prisma, type Transaction } from '@prisma/client'
import { TransactionsService } from './transactions.service'
import { AccountType, Currency } from '@prisma/client'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'
import { BadRequestException } from '@nestjs/common'

describe('TransactionsService', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const anotherAccountId = 'account-2'
  const assetId = 'asset-1'
  const anotherAssetId = 'asset-2'
  const tradeTime = '2026-03-25T09:30:00.000Z'
  const importedTradeTime = new Date('2026-03-23T16:00:00.000Z')
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
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      position: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      positionLot: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      sellLotMatch: {
        createMany: jest.fn(),
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
        findUnique: jest.fn(),
        findFirst: jest.fn(),
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

  function buildImportContent(rows: string[][]) {
    return [
      [
        '股名',
        '日期',
        '成交股數',
        '淨收付',
        '成交單價',
        '手續費',
        '交易稅',
        '稅款',
        '委託書號',
        '幣別',
        '備註',
      ].join('\t'),
      ...rows.map((row) => row.join('\t')),
    ].join('\n')
  }

  function mockImportAccount(
    prisma: ReturnType<typeof createHarness>['prisma'],
    overrides: Record<string, unknown> = {},
  ) {
    prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: accountId,
      type: AccountType.broker,
      broker: SUPPORTED_BROKER,
      currency: Currency.TWD,
      ...overrides,
    })
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

  it('reduces quantity and keeps the position open when removing a non-final buy transaction', async () => {
    const { service, txClient, postingService } = createHarness()
    const removedTransaction = buildCreatedTransaction({
      amount: 330,
      quantity: 6,
      price: 54,
      fee: 6,
      isDeleted: true,
      deletedAt: new Date('2026-03-25T10:00:00.000Z'),
    })

    txClient.transaction.update.mockResolvedValue(removedTransaction)
    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 26,
      avgCost: 51.1538461538,
    })

    await service.remove('tx-1', userId)

    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-1',
      txClient,
    )
    const updateCall = txClient.position.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 'position-1' })
    expect(updateCall.data.quantity).toBe(20)
    expect(updateCall.data.avgCost).toBeCloseTo(50, 8)
    expect(updateCall.data.closedAt).toBeNull()
  })

  it('reduces quantity and keeps the position open when hard deleting a non-final buy transaction', async () => {
    const { service, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      amount: 330,
      quantity: 6,
      price: 54,
      fee: 6,
    })

    txClient.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.delete.mockResolvedValue(existingTransaction)
    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 26,
      avgCost: 51.1538461538,
    })

    await service.hardDelete('tx-1', userId)

    expect(postingService.archiveTransactionEntries).toHaveBeenCalledWith(
      userId,
      'tx-1',
      txClient,
    )
    const updateCall = txClient.position.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 'position-1' })
    expect(updateCall.data.quantity).toBe(20)
    expect(updateCall.data.avgCost).toBeCloseTo(50, 8)
    expect(updateCall.data.closedAt).toBeNull()
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

  it('rejects updating a sell transaction until FIFO rollback is implemented', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      tradeTime: new Date(sellTradeTime),
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)

    await expect(
      service.update(
        'tx-sell-1',
        {
          amount: 520,
          tradeTime: sellTradeTime,
        },
        userId,
      ),
    ).rejects.toThrow(
      'Updating sell transactions is not supported until FIFO rollback is implemented',
    )

    expect(txClient.transaction.update).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
    expect(txClient.positionLot.update).not.toHaveBeenCalled()
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

  it('rejects removing a sell transaction until FIFO rollback is implemented', async () => {
    const { service, txClient, postingService } = createHarness()

    txClient.transaction.findUnique.mockResolvedValue({
      type: 'sell',
    })

    await expect(
      service.remove('tx-sell-1', userId),
    ).rejects.toThrow(
      'Removing sell transactions is not supported until FIFO rollback is implemented',
    )

    expect(txClient.transaction.update).not.toHaveBeenCalled()
    expect(postingService.archiveTransactionEntries).not.toHaveBeenCalled()
    expect(txClient.positionLot.update).not.toHaveBeenCalled()
  })

  it('rejects hard deleting a sell transaction until FIFO rollback is implemented', async () => {
    const { service, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction({
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      tradeTime: new Date(sellTradeTime),
    })

    txClient.transaction.findUnique.mockResolvedValue(existingTransaction)

    await expect(
      service.hardDelete('tx-sell-1', userId),
    ).rejects.toThrow(
      'Hard deleting sell transactions is not supported until FIFO rollback is implemented',
    )

    expect(txClient.transaction.delete).not.toHaveBeenCalled()
    expect(postingService.archiveTransactionEntries).not.toHaveBeenCalled()
    expect(txClient.positionLot.update).not.toHaveBeenCalled()
  })

  it('rejects a buy update when the resulting position would become invalid', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const existingTransaction = buildCreatedTransaction()
    const updatedTransaction = buildCreatedTransaction({
      amount: 100,
      quantity: 1,
      price: 100,
      fee: 0,
    })

    prisma.transaction.findUnique.mockResolvedValue(existingTransaction)
    txClient.transaction.update.mockResolvedValue(updatedTransaction)
    txClient.position.findFirst.mockResolvedValue({
      id: 'position-1',
      quantity: 5,
      avgCost: 50,
    })
    postingService.postTransaction.mockResolvedValue({ id: 'entry-5' })

    await expect(
      service.update(
        'tx-1',
        {
          amount: 100,
          quantity: 1,
          price: 100,
          fee: 0,
          tradeTime,
        },
        userId,
      ),
    ).rejects.toThrow('updated buy transaction would invalidate the active position')

    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: updatedTransaction,
      db: txClient,
    })
  })

  it('imports a valid broker buy row and creates GL and position side effects', async () => {
    const { service, prisma, txClient, postingService, ownershipService } =
      createHarness()
    const importedTransaction = buildCreatedTransaction({
      id: 'tx-import-1',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 5,
      brokerOrderNo: 'BRK-001',
      note: '整股',
      tradeTime: importedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    txClient.transaction.create.mockResolvedValue(importedTransaction)
    txClient.position.findFirst.mockResolvedValue(null)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-import-1' })

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-001', 'TWD', '整股'],
        ]),
      },
      userId,
    )

    expect(ownershipService.validateAccountOwnership).toHaveBeenCalledWith(
      accountId,
      userId,
    )
    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: {
        accountId,
        assetId,
        type: 'buy',
        amount: 1015,
        quantity: 10,
        price: 100,
        fee: 10,
        tax: 5,
        brokerOrderNo: 'BRK-001',
        tradeTime: importedTradeTime,
        note: '整股',
      },
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
      },
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: importedTransaction,
      db: txClient,
    })
    expect(txClient.position.create).toHaveBeenCalledWith({
      data: {
        accountId,
        assetId,
        quantity: 10,
        avgCost: 101.5,
        openedAt: importedTradeTime,
      },
    })
    expect(result).toEqual({
      totalRows: 1,
      successCount: 1,
      failureCount: 0,
      createdTransactionIds: ['tx-import-1'],
      errors: [],
    })
  })

  it('returns a row error and skips side effects when importing a sell row', async () => {
    const { service, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '985', '100', '10', '3', '2', 'BRK-SELL-001', 'TWD', '賣出'],
        ]),
      },
      userId,
    )

    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
    expect(txClient.position.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      totalRows: 1,
      successCount: 0,
      failureCount: 1,
      createdTransactionIds: [],
      errors: [
        {
          row: 2,
          field: '淨收付',
          message:
            'Sell transactions are temporarily disabled until cost basis tracking is implemented',
        },
      ],
    })
  })

  it('returns a row error and skips creation when broker order number already exists', async () => {
    const { service, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue({ id: 'existing-tx' })

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-001', 'TWD', '重複單號'],
        ]),
      },
      userId,
    )

    expect(prisma.assetAlias.findUnique).not.toHaveBeenCalled()
    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      totalRows: 1,
      successCount: 0,
      failureCount: 1,
      createdTransactionIds: [],
      errors: [
        {
          row: 2,
          field: '委託書號',
          message: 'Duplicate broker order number for selected account',
        },
      ],
    })
  })

  it('rejects the import before processing rows when a required header is missing', async () => {
    const { service, prisma } = createHarness()

    mockImportAccount(prisma)

    await expect(
      service.importTransactions(
        {
          accountId,
          csvContent: [
            ['股名', '日期', '成交股數', '淨收付', '成交單價', '手續費', '交易稅', '稅款', '幣別', '備註'].join('\t'),
            ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'TWD', '漏欄位'].join('\t'),
          ].join('\n'),
        },
        userId,
      ),
    ).rejects.toThrow('Missing required import column: 委託書號')
  })

  it('continues importing later rows after a row-level validation error', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const secondImportedTradeTime = new Date('2026-03-24T16:00:00.000Z')
    const firstImportedTransaction = buildCreatedTransaction({
      id: 'tx-import-1',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 5,
      brokerOrderNo: 'BRK-001',
      note: '首筆',
      tradeTime: importedTradeTime,
    })
    const secondImportedTransaction = buildCreatedTransaction({
      id: 'tx-import-2',
      amount: 505,
      quantity: 5,
      price: 100,
      fee: 5,
      tax: 0,
      brokerOrderNo: 'BRK-002',
      note: '第三列',
      tradeTime: secondImportedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce({ assetId })
      .mockResolvedValueOnce({ assetId })
    txClient.transaction.create
      .mockResolvedValueOnce(firstImportedTransaction)
      .mockResolvedValueOnce(secondImportedTransaction)
    txClient.position.findFirst.mockResolvedValue(null)
    postingService.postTransaction
      .mockResolvedValueOnce({ id: 'entry-import-1' })
      .mockResolvedValueOnce({ id: 'entry-import-2' })

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-001', 'TWD', '首筆'],
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-USD', 'USD', '幣別錯誤'],
          ['富邦台50', '2026/03/25', '5', '-505', '100', '5', '0', '0', 'BRK-002', 'TWD', '第三列'],
        ]),
      },
      userId,
    )

    expect(txClient.transaction.create).toHaveBeenCalledTimes(2)
    expect(postingService.postTransaction).toHaveBeenCalledTimes(2)
    expect(txClient.position.create).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      totalRows: 3,
      successCount: 2,
      failureCount: 1,
      createdTransactionIds: ['tx-import-1', 'tx-import-2'],
      errors: [
        {
          row: 3,
          field: '幣別',
          message: 'Currency USD does not match account currency TWD',
        },
      ],
    })
  })

  it('falls back to the global asset alias when the broker-specific alias is missing', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const importedTransaction = buildCreatedTransaction({
      id: 'tx-import-global-alias',
      assetId: anotherAssetId,
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 5,
      brokerOrderNo: 'BRK-GLOBAL-001',
      note: '全域別名',
      tradeTime: importedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ assetId: anotherAssetId })
    txClient.transaction.create.mockResolvedValue(importedTransaction)
    txClient.position.findFirst.mockResolvedValue(null)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-import-global-alias' })

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['全域ETF', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-GLOBAL-001', 'TWD', '全域別名'],
        ]),
      },
      userId,
    )

    expect(prisma.assetAlias.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        alias_broker: {
          alias: '全域ETF',
          broker: SUPPORTED_BROKER,
        },
      },
      select: { assetId: true },
    })
    expect(prisma.assetAlias.findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        alias_broker: {
          alias: '全域ETF',
          broker: '',
        },
      },
      select: { assetId: true },
    })
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetId: anotherAssetId,
          brokerOrderNo: 'BRK-GLOBAL-001',
        }),
      }),
    )
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(0)
  })

  it('returns a row error when the same broker order number appears twice in the import file', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const importedTransaction = buildCreatedTransaction({
      id: 'tx-import-1',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 5,
      brokerOrderNo: 'BRK-DUP-001',
      note: '第一列',
      tradeTime: importedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce({ assetId })
      .mockResolvedValueOnce({ assetId })
    txClient.transaction.create.mockResolvedValue(importedTransaction)
    txClient.position.findFirst.mockResolvedValue(null)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-import-1' })

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-DUP-001', 'TWD', '第一列'],
          ['富邦台50', '2026/03/25', '5', '-505', '100', '5', '0', '0', 'BRK-DUP-001', 'TWD', '重複單號'],
        ]),
      },
      userId,
    )

    expect(prisma.transaction.findFirst).toHaveBeenCalledTimes(1)
    expect(txClient.transaction.create).toHaveBeenCalledTimes(1)
    expect(postingService.postTransaction).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      totalRows: 2,
      successCount: 1,
      failureCount: 1,
      createdTransactionIds: ['tx-import-1'],
      errors: [
        {
          row: 3,
          field: '委託書號',
          message: 'Duplicate broker order number in import file',
        },
      ],
    })
  })

  it('rejects the import before processing rows when the selected account is not a broker account', async () => {
    const { service, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma, { type: AccountType.bank, broker: null })

    await expect(
      service.importTransactions(
        {
          accountId,
          csvContent: buildImportContent([
            ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-BANK-001', 'TWD', '非券商帳戶'],
          ]),
        },
        userId,
      ),
    ).rejects.toThrow('Selected account is not a broker account')

    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('rejects the import before processing rows when the broker account has no broker configured', async () => {
    const { service, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma, { broker: null })

    await expect(
      service.importTransactions(
        {
          accountId,
          csvContent: buildImportContent([
            ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-NO-BROKER-001', 'TWD', '缺 broker'],
          ]),
        },
        userId,
      ),
    ).rejects.toThrow('Selected account does not have a broker configured')

    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('rejects the import before processing rows when the broker is unsupported', async () => {
    const { service, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma, { broker: 'other-broker' })

    await expect(
      service.importTransactions(
        {
          accountId,
          csvContent: buildImportContent([
            ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-OTHER-001', 'TWD', '不支援券商'],
          ]),
        },
        userId,
      ),
    ).rejects.toThrow(`Only ${SUPPORTED_BROKER} broker accounts are supported for CSV import`)

    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
  })

  it('returns a row error when the imported currency is unsupported', async () => {
    const { service, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-CUR-001', 'HKD', '不支援幣別'],
        ]),
      },
      userId,
    )

    expect(prisma.assetAlias.findUnique).not.toHaveBeenCalled()
    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      totalRows: 1,
      successCount: 0,
      failureCount: 1,
      createdTransactionIds: [],
      errors: [
        {
          row: 2,
          field: '幣別',
          message: 'Unsupported currency: HKD',
        },
      ],
    })
  })

  it('returns a duplicate broker order error when create raises P2002 during import', async () => {
    const { service, prisma, txClient, postingService } = createHarness()
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    )

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    txClient.transaction.create.mockRejectedValue(duplicateError)

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-P2002-001', 'TWD', '建立時重複'],
        ]),
      },
      userId,
    )

    expect(postingService.postTransaction).not.toHaveBeenCalled()
    expect(txClient.position.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      totalRows: 1,
      successCount: 0,
      failureCount: 1,
      createdTransactionIds: [],
      errors: [
        {
          row: 2,
          field: '委託書號',
          message: 'Duplicate broker order number for selected account',
        },
      ],
    })
  })

  it('returns the create error message when a row fails business validation during import', async () => {
    const { service, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    txClient.transaction.create.mockRejectedValue(
      new BadRequestException('Amount must be a positive number'),
    )

    const result = await service.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-BIZ-001', 'TWD', '業務驗證錯誤'],
        ]),
      },
      userId,
    )

    expect(postingService.postTransaction).not.toHaveBeenCalled()
    expect(txClient.position.create).not.toHaveBeenCalled()
    expect(result).toEqual({
      totalRows: 1,
      successCount: 0,
      failureCount: 1,
      createdTransactionIds: [],
      errors: [
        {
          row: 2,
          field: 'row',
          message: 'Amount must be a positive number',
        },
      ],
    })
  })
})
