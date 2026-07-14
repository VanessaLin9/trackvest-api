/**
 * Sell-readiness unit diagnostics retained as regression coverage for
 * chronological write-order commits (Branch 3).
 */
import { AccountType, Currency, type Transaction } from '@prisma/client'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { ImportAssetAliasResolver } from './import-asset-alias.resolver'
import { ImportBrokerAccountGuard } from './import-broker-account.guard'
import { ImportBrokerOrderDuplicateChecker } from './import-broker-order-duplicate.checker'
import { TransactionImportEvaluationService } from './transaction-import-evaluation.service'
import { TransactionImportRowValidator } from './transaction-import-row.validator'
import { TransactionImportService } from './transaction-import.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionBusinessRulesValidator } from './transaction-business-rules-validator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'
import { TransactionsService } from './transactions.service'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'
import { Prisma } from '@prisma/client'

describe('Transaction import sell-readiness diagnostics (unit)', () => {
  const userId = 'user-diagnostic'
  const accountId = 'account-diagnostic'
  const assetId = 'asset-diagnostic'
  const importedTradeTime = new Date('2022-01-03T16:00:00.000Z')

  function buildImportContent(rows: string[][]) {
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
    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
  }

  function buildCreatedTransaction(overrides: Record<string, unknown> = {}): Transaction {
    return {
      id: 'tx-created',
      accountId,
      assetId,
      type: 'buy',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 10,
      tax: 0,
      brokerOrderNo: 'BRK-001',
      tradeTime: importedTradeTime,
      note: null,
      isDeleted: false,
      deletedAt: null,
      account: { userId },
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
      account: { findUniqueOrThrow: jest.fn() },
      asset: { findUnique: jest.fn() },
      assetAlias: { findUnique: jest.fn() },
      transaction: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
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

    const transactionPositionOrchestrator = new TransactionPositionOrchestratorService(
      positionReplayService as never,
      postingService as never,
      new TransactionRebuildPolicyService(),
    )

    const transactionsService = new TransactionsService(
      prisma as never,
      postingService as never,
      ownershipService as never,
      transactionPositionOrchestrator,
      new TransactionBusinessRulesValidator(),
    )

    const importService = new TransactionImportService(
      prisma as never,
      ownershipService as never,
      transactionsService,
      new BrokerImportFileParser(),
      new TransactionImportRowValidator(),
      new ImportBrokerAccountGuard(),
      new ImportAssetAliasResolver(prisma as never),
      new ImportBrokerOrderDuplicateChecker(prisma as never),
      new TransactionImportEvaluationService(
        prisma as never,
        new TransactionImportRowValidator(),
        new ImportAssetAliasResolver(prisma as never),
        new ImportBrokerOrderDuplicateChecker(prisma as never),
      ),
    )

    txClient.transaction.findFirst.mockResolvedValue(null)
    txClient.transaction.findMany.mockResolvedValue([])
    txClient.position.deleteMany.mockResolvedValue({ count: 0 })
    txClient.positionLot.deleteMany.mockResolvedValue({ count: 0 })
    txClient.sellLotMatch.deleteMany.mockResolvedValue({ count: 0 })
    prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: accountId,
      type: AccountType.broker,
      broker: SUPPORTED_BROKER,
      currency: Currency.TWD,
    })
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: 'E2E-2330',
      name: 'E2E TSMC',
    })
    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.findMany.mockResolvedValue([])

    return { importService, prisma, txClient, postingService, transactionsService }
  }

  it('parser preserves CSV source order (newest-first rows stay in file order)', () => {
    const parser = new BrokerImportFileParser()
    const { rows } = parser.parse(
      buildImportContent([
        ['E2E台積電', '2024/08/05', '1', '-846', '845', '1', '0', '0', 'BUY-NEW', 'TWD', ''],
        ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-MID', 'TWD', ''],
        ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-OLD', 'TWD', ''],
      ]),
    )

    expect(rows.map((row) => row.tradeDate)).toEqual([
      '2024/08/05',
      '2022/01/04',
      '2020/09/28',
    ])
  })

  it('preview does not call TransactionsService.create and marks sell-before-buy rows ready', async () => {
    const { importService, transactionsService } = createHarness()
    const createSpy = jest.spyOn(transactionsService, 'create')
    const csvContent = buildImportContent([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-FIRST', 'TWD', ''],
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-LATER', 'TWD', ''],
    ])

    const preview = await importService.previewImportTransactions(
      { accountId, csvContent },
      userId,
    )

    expect(createSpy).not.toHaveBeenCalled()
    expect(preview.canCommit).toBe(true)
    expect(preview.rows.every((row) => row.status === 'ready')).toBe(true)
  })

  it('commit processes sell-before-buy using chronological write order and succeeds', async () => {
    const { importService, txClient, postingService } = createHarness()
    const buyTradeTime = new Date('2020-09-27T16:00:00.000Z')
    const sellTradeTime = new Date('2022-01-03T16:00:00.000Z')

    txClient.transaction.create
      .mockResolvedValueOnce(
        buildCreatedTransaction({
          id: 'tx-buy',
          type: 'buy',
          quantity: 10,
          brokerOrderNo: 'BUY-LATER',
          tradeTime: buyTradeTime,
        }),
      )
      .mockResolvedValueOnce(
        buildCreatedTransaction({
          id: 'tx-sell',
          type: 'sell',
          quantity: 5,
          amount: 3250,
          price: 650,
          brokerOrderNo: 'SELL-FIRST',
          tradeTime: sellTradeTime,
        }),
      )
    txClient.position.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'position-1',
        quantity: 10,
        avgCost: 433.5,
        openedAt: buyTradeTime,
        closedAt: null,
      })
    txClient.positionLot.findMany.mockResolvedValueOnce([
      {
        id: 'lot-1',
        accountId,
        assetId,
        sourceTransactionId: 'tx-buy',
        originalQuantity: 10,
        remainingQuantity: 10,
        unitCost: 433.5,
        openedAt: buyTradeTime,
        closedAt: null,
      },
    ])
    postingService.postTransaction.mockResolvedValue({ id: 'entry-1' })

    const csvContent = buildImportContent([
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-FIRST', 'TWD', ''],
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-LATER', 'TWD', ''],
    ])

    const result = await importService.commitImportTransactions(
      { accountId, csvContent },
      userId,
    )

    expect(result.successCount).toBe(2)
    expect(result.createdTransactionIds).toEqual(['tx-buy', 'tx-sell'])
    expect(txClient.transaction.create.mock.calls[0][0].data.brokerOrderNo).toBe('BUY-LATER')
    expect(txClient.transaction.create.mock.calls[1][0].data.brokerOrderNo).toBe('SELL-FIRST')
  })

  it('commit succeeds for chronological buy-then-sell source order', async () => {
    const { importService, txClient, postingService } = createHarness()

    txClient.transaction.create
      .mockResolvedValueOnce(
        buildCreatedTransaction({
          id: 'tx-buy',
          type: 'buy',
          quantity: 10,
          brokerOrderNo: 'BUY-FIRST',
        }),
      )
      .mockResolvedValueOnce(
        buildCreatedTransaction({
          id: 'tx-sell',
          type: 'sell',
          quantity: 5,
          amount: 3250,
          price: 650,
          brokerOrderNo: 'SELL-SECOND',
        }),
      )

    txClient.position.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'position-1',
        quantity: 10,
        avgCost: 433.5,
        openedAt: new Date('2020-09-27T16:00:00.000Z'),
        closedAt: null,
      })

    txClient.positionLot.findMany.mockResolvedValueOnce([
      {
        id: 'lot-1',
        accountId,
        assetId,
        sourceTransactionId: 'tx-buy',
        originalQuantity: 10,
        remainingQuantity: 10,
        unitCost: 433.5,
        openedAt: new Date('2020-09-27T16:00:00.000Z'),
        closedAt: null,
      },
    ])

    postingService.postTransaction.mockResolvedValue({ id: 'entry-1' })

    const csvContent = buildImportContent([
      ['E2E台積電', '2020/09/28', '10', '-4335', '433.5', '1', '0', '0', 'BUY-FIRST', 'TWD', ''],
      ['E2E台積電', '2022/01/04', '5', '3250', '650', '1', '9', '0', 'SELL-SECOND', 'TWD', ''],
    ])

    const result = await importService.commitImportTransactions(
      { accountId, csvContent },
      userId,
    )

    expect(result.successCount).toBe(2)
    expect(result.failureCount).toBe(0)
  })
})
