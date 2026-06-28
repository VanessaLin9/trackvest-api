import { Currency } from '@prisma/client'
import { TransactionImportService } from './transaction-import.service'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { TransactionsService } from './transactions.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionBusinessRulesValidator } from './transaction-business-rules-validator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'
import { AccountType } from '@prisma/client'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'

describe('Transaction import row validation (characterization)', () => {
  const userId = 'user-1'
  const accountId = 'account-1'
  const assetId = 'asset-1'

  function buildImportContent(rows: string[][]): string {
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
    return [headers.join('\t'), ...rows.map((row) => row.join('\t'))].join('\n')
  }

  function createHarness() {
    const prisma = {
      account: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: accountId,
          type: AccountType.broker,
          broker: SUPPORTED_BROKER,
          currency: Currency.TWD,
        }),
      },
      assetAlias: { findUnique: jest.fn() },
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
    }

    const ownershipService = {
      validateAccountOwnership: jest.fn(),
    }

    const postingService = {
      postTransaction: jest.fn(),
      archiveTransactionEntries: jest.fn(),
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
    const transactionBusinessRulesValidator = new TransactionBusinessRulesValidator()
    const transactionsService = new TransactionsService(
      {} as never,
      postingService as never,
      ownershipService as never,
      transactionPositionOrchestrator as never,
      transactionBusinessRulesValidator,
    )
    const brokerImportFileParser = new BrokerImportFileParser()
    const importService = new TransactionImportService(
      prisma as never,
      ownershipService as never,
      transactionsService,
      brokerImportFileParser,
    )

    return { importService, prisma }
  }

  async function expectRowError(
    dataRow: string[],
    expected: { row: number; field: string; message: string },
  ): Promise<void> {
    const { importService } = createHarness()

    const result = await importService.importTransactions(
      { accountId, csvContent: buildImportContent([dataRow]) },
      userId,
    )

    expect(result.successCount).toBe(0)
    expect(result.failureCount).toBe(1)
    expect(result.errors).toEqual([expected])
  }

  it('rejects missing asset name', async () => {
    await expectRowError(
      ['', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', ''],
      { row: 2, field: '股名', message: 'Asset name is required' },
    )
  })

  it('rejects invalid trade date', async () => {
    await expectRowError(
      ['富邦台50', 'not-a-date', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', ''],
      { row: 2, field: '日期', message: 'Trade date is invalid' },
    )
  })

  it('rejects non-positive quantity', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '0', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', ''],
      { row: 2, field: '成交股數', message: 'Quantity must be a positive number' },
    )
  })

  it('rejects zero net settlement', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '10', '0', '100', '10', '3', '2', 'BRK-001', 'TWD', ''],
      { row: 2, field: '淨收付', message: 'Net settlement cannot be zero' },
    )
  })

  it('rejects non-positive price', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '10', '-1015', '0', '10', '3', '2', 'BRK-001', 'TWD', ''],
      { row: 2, field: '成交單價', message: 'Price must be a positive number' },
    )
  })

  it('rejects negative fee', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '10', '-1015', '100', '-1', '3', '2', 'BRK-001', 'TWD', ''],
      { row: 2, field: '手續費', message: 'Fee must be zero or a positive number' },
    )
  })

  it('rejects negative trade tax', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '-1', '2', 'BRK-001', 'TWD', ''],
      { row: 2, field: '交易稅', message: 'Trade tax must be zero or a positive number' },
    )
  })

  it('rejects negative tax amount', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '-1', 'BRK-001', 'TWD', ''],
      { row: 2, field: '稅款', message: 'Tax amount must be zero or a positive number' },
    )
  })

  it('rejects missing broker order number', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', '', 'TWD', ''],
      { row: 2, field: '委託書號', message: 'Broker order number is required' },
    )
  })

  it('rejects unsupported currency', async () => {
    await expectRowError(
      ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'GBP', ''],
      { row: 2, field: '幣別', message: 'Unsupported currency: GBP' },
    )
  })

  it('rejects currency mismatch with account currency', async () => {
    const { importService, prisma } = createHarness()
    prisma.account.findUniqueOrThrow.mockResolvedValue({
      id: accountId,
      type: AccountType.broker,
      broker: SUPPORTED_BROKER,
      currency: Currency.TWD,
    })

    const result = await importService.importTransactions(
      {
        accountId,
        csvContent: buildImportContent([
          ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'USD', ''],
        ]),
      },
      userId,
    )

    expect(result.errors).toEqual([
      {
        row: 2,
        field: '幣別',
        message: 'Currency USD does not match account currency TWD',
      },
    ])
  })

  it('reports the first validation error when multiple fields are invalid', async () => {
    await expectRowError(
      ['', 'not-a-date', '0', '0', '0', '-1', '-1', '-1', '', 'GBP', ''],
      { row: 2, field: '股名', message: 'Asset name is required' },
    )
  })
})
