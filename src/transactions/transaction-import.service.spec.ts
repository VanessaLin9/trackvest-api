import { Prisma, type Transaction } from '@prisma/client'
import { BadRequestException } from '@nestjs/common'
import { TransactionImportService } from './transaction-import.service'
import { TransactionsService } from './transactions.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'
import { AccountType, Currency } from '@prisma/client'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'

describe('TransactionImportService', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const assetId = 'asset-1'
  const anotherAssetId = 'asset-2'
  const importedTradeTime = new Date('2026-03-23T16:00:00.000Z')

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
      tradeTime: importedTradeTime,
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

    const transactionsServiceRef: { current?: TransactionsService } = {}
    const importService = new TransactionImportService(
      prisma as never,
      ownershipService as never,
      {
        create: (dto, uid) => transactionsServiceRef.current!.create(dto, uid),
      } as TransactionsService,
    )

    const transactionsService = new TransactionsService(
      prisma as never,
      postingService as never,
      ownershipService as never,
      transactionPositionOrchestrator as never,
      importService as never,
    )
    transactionsServiceRef.current = transactionsService

    txClient.transaction.findFirst.mockResolvedValue(null)
    txClient.transaction.findMany.mockResolvedValue([])
    txClient.position.deleteMany.mockResolvedValue({ count: 0 })
    txClient.positionLot.deleteMany.mockResolvedValue({ count: 0 })
    txClient.sellLotMatch.deleteMany.mockResolvedValue({ count: 0 })

    return {
      importService,
      transactionsService,
      prisma,
      txClient,
      postingService,
      ownershipService,
    }
  }

  function buildImportContent(rows: string[][], delimiter: '\t' | ',' = '\t') {
    const headers = [
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
    ]
    return [
      headers.join(delimiter),
      ...rows.map((row) => row.join(delimiter)),
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

  /*
   * P4 import characterization inventory:
   * - delimiter tab: covered by buildImportContent default and most import specs
   * - delimiter comma: covered by "imports a valid broker buy row from comma-delimited CSV"
   * - quoted CSV: covered by "imports a row with a quoted note field containing the delimiter"
   * - missing columns: covered by "rejects the import ... missing header"
   * - duplicate brokerOrderNo in file: covered
   * - duplicate brokerOrderNo in DB / P2002: covered
   * - currency mismatch / unsupported: covered
   * - asset alias missing: covered by "returns a row error when the asset alias is not found"
   * - asset alias global fallback: covered
   * - partial success: covered by "continues importing later rows"
   * Tests live in transaction-import.service.spec.ts.
   */
  it('imports a valid broker buy row from comma-delimited CSV', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()
    const importedTransaction = buildCreatedTransaction({
      id: 'tx-import-comma-1',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 5,
      brokerOrderNo: 'BRK-COMMA-001',
      note: '逗號分隔',
      tradeTime: importedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    txClient.transaction.create.mockResolvedValue(importedTransaction)
    txClient.position.findFirst.mockResolvedValue(null)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-import-comma-1' })

    const result = await importService.importTransactions(
      {
        accountId,
        csvContent: buildImportContent(
          [['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-COMMA-001', 'TWD', '逗號分隔']],
          ',',
        ),
      },
      userId,
    )

    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'buy',
          brokerOrderNo: 'BRK-COMMA-001',
          note: '逗號分隔',
        }),
      }),
    )
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(0)
  })

  it('imports a row with a quoted note field containing the delimiter', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()
    const note = '整股,含逗號'
    const importedTransaction = buildCreatedTransaction({
      id: 'tx-import-quoted-1',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 5,
      brokerOrderNo: 'BRK-QUOTED-001',
      note,
      tradeTime: importedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    txClient.transaction.create.mockResolvedValue(importedTransaction)
    txClient.position.findFirst.mockResolvedValue(null)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-import-quoted-1' })

    const result = await importService.importTransactions(
      {
        accountId,
        csvContent: [
          '股名,日期,成交股數,淨收付,成交單價,手續費,交易稅,稅款,委託書號,幣別,備註',
          `富邦台50,2026/03/24,10,-1015,100,10,3,2,BRK-QUOTED-001,TWD,"${note}"`,
        ].join('\n'),
      },
      userId,
    )

    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note,
          brokerOrderNo: 'BRK-QUOTED-001',
        }),
      }),
    )
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(0)
  })

  it('returns a row error when the asset alias is not found', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    const result = await importService.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['未知標的', '2026/03/24', '10', '-1,015', '100', '10', '3', '2', 'BRK-ALIAS-001', 'TWD', '缺別名'],
        ]),
      },
      userId,
    )

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
          field: '股名',
          message: 'Asset alias not found for 未知標的',
        },
      ],
    })
  })

  it('imports a valid broker buy row and creates GL and position side effects', async () => {
    const { importService, prisma, txClient, postingService, ownershipService } =
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

    const result = await importService.importTransactions(
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

  it('imports a valid sell row and creates FIFO lot matches', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()
    const importedSellTransaction = buildCreatedTransaction({
      id: 'tx-import-sell-1',
      type: 'sell',
      amount: 985,
      quantity: 4,
      price: 250,
      fee: 10,
      tax: 5,
      brokerOrderNo: 'BRK-SELL-001',
      note: '匯入賣出',
      tradeTime: importedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
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
    txClient.transaction.create.mockResolvedValue(importedSellTransaction)
    postingService.postTransaction.mockResolvedValue({ id: 'entry-import-sell-1' })

    const result = await importService.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '4', '985', '250', '10', '3', '2', 'BRK-SELL-001', 'TWD', '匯入賣出'],
        ]),
      },
      userId,
    )

    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'sell',
          amount: 985,
          quantity: 4,
          price: 250,
          fee: 10,
          tax: 5,
          brokerOrderNo: 'BRK-SELL-001',
          tradeTime: importedTradeTime,
        }),
      }),
    )
    expect(txClient.sellLotMatch.createMany).toHaveBeenCalledWith({
      data: [
        {
          sellTransactionId: 'tx-import-sell-1',
          buyLotId: 'lot-1',
          quantity: 4,
          unitCost: 100,
        },
      ],
    })
    expect(postingService.postTransaction).toHaveBeenCalledWith({
      userId,
      transaction: importedSellTransaction,
      db: txClient,
    })
    expect(result).toEqual({
      totalRows: 1,
      successCount: 1,
      failureCount: 0,
      createdTransactionIds: ['tx-import-sell-1'],
      errors: [],
    })
  })

  it('returns a row error when an imported sell exceeds the remaining open lots', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
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

    const result = await importService.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '6', '1500', '250', '0', '0', '0', 'BRK-SELL-OVR', 'TWD', '超賣'],
        ]),
      },
      userId,
    )

    expect(txClient.transaction.create).not.toHaveBeenCalled()
    expect(txClient.sellLotMatch.createMany).not.toHaveBeenCalled()
    expect(postingService.postTransaction).not.toHaveBeenCalled()
    expect(result).toEqual({
      totalRows: 1,
      successCount: 0,
      failureCount: 1,
      createdTransactionIds: [],
      errors: [
        {
          row: 2,
          field: 'row',
          message: 'sell quantity exceeds the remaining open position lots',
        },
      ],
    })
  })

  it('returns a row error and skips creation when broker order number already exists', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue({ id: 'existing-tx' })

    const result = await importService.importTransactions(
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
    const { importService, prisma } = createHarness()

    mockImportAccount(prisma)

    await expect(
      importService.importTransactions(
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
    const { importService, prisma, txClient, postingService } = createHarness()
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

    const result = await importService.importTransactions(
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

  it('continues importing a mixed buy and sell file when both rows are valid', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()
    const buyImportedTradeTime = importedTradeTime
    const sellImportedTradeTime = new Date('2026-03-24T16:00:00.000Z')
    const importedBuyTransaction = buildCreatedTransaction({
      id: 'tx-import-buy-1',
      type: 'buy',
      amount: 1010,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 0,
      brokerOrderNo: 'BRK-MIX-BUY-001',
      note: '混合檔買進',
      tradeTime: buyImportedTradeTime,
    })
    const importedSellTransaction = buildCreatedTransaction({
      id: 'tx-import-sell-2',
      type: 'sell',
      amount: 630,
      quantity: 5,
      price: 126,
      fee: 0,
      tax: 0,
      brokerOrderNo: 'BRK-MIX-SELL-001',
      note: '混合檔賣出',
      tradeTime: sellImportedTradeTime,
    })

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce({ assetId })
      .mockResolvedValueOnce({ assetId })
    txClient.transaction.create
      .mockResolvedValueOnce(importedBuyTransaction)
      .mockResolvedValueOnce(importedSellTransaction)
    txClient.position.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'position-1',
        quantity: 10,
        avgCost: 101,
        openedAt: buyImportedTradeTime,
        closedAt: null,
      })
    txClient.positionLot.findMany.mockResolvedValueOnce([
      {
        id: 'lot-1',
        accountId,
        assetId,
        sourceTransactionId: 'tx-import-buy-1',
        originalQuantity: 10,
        remainingQuantity: 10,
        unitCost: 101,
        openedAt: buyImportedTradeTime,
        closedAt: null,
      },
    ])
    postingService.postTransaction
      .mockResolvedValueOnce({ id: 'entry-import-buy-1' })
      .mockResolvedValueOnce({ id: 'entry-import-sell-2' })

    const result = await importService.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1,010', '100', '10', '0', '0', 'BRK-MIX-BUY-001', 'TWD', '混合檔買進'],
          ['富邦台50', '2026/03/25', '5', '630', '126', '0', '0', '0', 'BRK-MIX-SELL-001', 'TWD', '混合檔賣出'],
        ]),
      },
      userId,
    )

    expect(txClient.transaction.create).toHaveBeenCalledTimes(2)
    expect(txClient.positionLot.create).toHaveBeenCalledTimes(1)
    expect(txClient.sellLotMatch.createMany).toHaveBeenCalledWith({
      data: [
        {
          sellTransactionId: 'tx-import-sell-2',
          buyLotId: 'lot-1',
          quantity: 5,
          unitCost: 101,
        },
      ],
    })
    expect(postingService.postTransaction).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      totalRows: 2,
      successCount: 2,
      failureCount: 0,
      createdTransactionIds: ['tx-import-buy-1', 'tx-import-sell-2'],
      errors: [],
    })
  })

  it('falls back to the global asset alias when the broker-specific alias is missing', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()
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

    const result = await importService.importTransactions(
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
    const { importService, prisma, txClient, postingService } = createHarness()
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

    const result = await importService.importTransactions(
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
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma, { type: AccountType.bank, broker: null })

    await expect(
      importService.importTransactions(
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
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma, { broker: null })

    await expect(
      importService.importTransactions(
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
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma, { broker: 'other-broker' })

    await expect(
      importService.importTransactions(
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
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)

    const result = await importService.importTransactions(
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

  it.each([
    ['JPY', Currency.JPY],
    ['日圓', Currency.JPY],
    ['EUR', Currency.EUR],
    ['歐元', Currency.EUR],
  ])('accepts supported imported currency %s', async (inputCurrency, expectedCurrency) => {
    const { importService, prisma } = createHarness()

    mockImportAccount(prisma)

    const normalizedCurrency = (importService as unknown as {
      normalizeCurrency(value: string): Currency | null
    }).normalizeCurrency(inputCurrency)

    expect(normalizedCurrency).toBe(expectedCurrency)
  })

  it('returns a duplicate broker order error when create raises P2002 during import', async () => {
    const { importService, prisma, txClient, postingService } = createHarness()
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

    const result = await importService.importTransactions(
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
    const { importService, prisma, txClient, postingService } = createHarness()

    mockImportAccount(prisma)
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    txClient.transaction.create.mockRejectedValue(
      new BadRequestException('Amount must be a positive number'),
    )

    const result = await importService.importTransactions(
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
