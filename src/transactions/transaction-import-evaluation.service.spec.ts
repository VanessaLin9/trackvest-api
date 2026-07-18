import { AccountType, Currency } from '@prisma/client'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { ImportAssetAliasResolver } from './import-asset-alias.resolver'
import { ImportBrokerOrderDuplicateChecker } from './import-broker-order-duplicate.checker'
import { IMPORT_ERROR_CODES } from './import-error-codes'
import { TransactionImportEvaluationService } from './transaction-import-evaluation.service'
import { TransactionImportRowValidator } from './transaction-import-row.validator'

describe('TransactionImportEvaluationService', () => {
  const accountId = 'account-1'
  const assetId = 'asset-1'

  function createHarness() {
    const prisma = {
      asset: {
        findUnique: jest.fn(),
      },
      transaction: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      assetAlias: {
        findUnique: jest.fn(),
      },
    }

    const evaluationService = new TransactionImportEvaluationService(
      prisma as never,
      new TransactionImportRowValidator(),
      new ImportAssetAliasResolver(),
      new ImportBrokerOrderDuplicateChecker(),
    )

    return { evaluationService, prisma }
  }

  function buildRawRow(
    overrides: Partial<{
      rowNumber: number
      assetName: string
      tradeDate: string
      quantity: string
      netAmount: string
      price: string
      fee: string
      tradeTax: string
      taxAmount: string
      brokerOrderNo: string
      currency: string
      note: string
    }> = {},
  ) {
    return {
      rowNumber: 2,
      assetName: '富邦台50',
      tradeDate: '2026/03/24',
      quantity: '10',
      netAmount: '-1015',
      price: '100',
      fee: '10',
      tradeTax: '3',
      taxAmount: '2',
      brokerOrderNo: 'BRK-001',
      currency: 'TWD',
      note: '整股',
      ...overrides,
    }
  }

  const account = {
    id: accountId,
    type: AccountType.broker,
    broker: SUPPORTED_BROKER,
    currency: Currency.TWD,
  }

  it('returns ready rows with resolved asset and normalized transaction fields', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [buildRawRow()],
      account,
      accountId,
    })

    expect(result).toEqual({
      totalRows: 1,
      readyCount: 1,
      errorCount: 0,
      warningCount: 0,
      skippedCount: 0,
      canCommit: true,
      writeOrderRowNumbers: [2],
      rows: [
        {
          row: 2,
          status: 'ready',
          rawAssetName: '富邦台50',
          brokerOrderNo: 'BRK-001',
          tradeDate: '2026-03-24',
          resolvedAsset: {
            id: assetId,
            symbol: '006208',
            name: '富邦台50',
          },
          normalizedTransaction: {
            type: 'buy',
            quantity: '10',
            unitPrice: '100',
            currency: 'TWD',
            fees: '10',
            taxes: '5',
          },
          errors: [],
          warnings: [],
        },
      ],
    })
  })

  it('returns row-level ASSET_ALIAS_NOT_FOUND without writing transactions', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    prisma.transaction.findFirst.mockResolvedValue(null)

    const result = await evaluationService.evaluateImportRows({
      rawRows: [buildRawRow({ assetName: '未知標的' })],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(false)
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        resolvedAsset: null,
        normalizedTransaction: null,
        errors: [
          {
            code: IMPORT_ERROR_CODES.ASSET_ALIAS_NOT_FOUND,
            field: 'assetName',
            message: 'Asset alias not found for 未知標的',
          },
        ],
      }),
    )
    expect(prisma.asset.findUnique).not.toHaveBeenCalled()
  })

  it('returns row-level DUPLICATE_BROKER_ORDER_IN_FILE', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({ rowNumber: 2, brokerOrderNo: 'BRK-DUP' }),
        buildRawRow({ rowNumber: 3, brokerOrderNo: 'BRK-DUP' }),
      ],
      account,
      accountId,
    })

    expect(result.readyCount).toBe(1)
    expect(result.errorCount).toBe(1)
    expect(result.canCommit).toBe(false)
    expect(result.rows[1].errors[0]).toEqual({
      code: IMPORT_ERROR_CODES.DUPLICATE_BROKER_ORDER_IN_FILE,
      field: 'brokerOrderNo',
      message: 'Duplicate broker order number in import file',
    })
  })

  it('returns row-level DUPLICATE_BROKER_ORDER_ALREADY_IMPORTED as skipped', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue({ id: 'existing-tx' })
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [buildRawRow()],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(true)
    expect(result.readyCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.errorCount).toBe(0)
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: 'skipped',
        errors: [],
        warnings: [
          {
            code: IMPORT_ERROR_CODES.DUPLICATE_BROKER_ORDER_ALREADY_IMPORTED,
            field: 'brokerOrderNo',
            message: 'Duplicate broker order number for selected account',
          },
        ],
      }),
    )
  })

  it('keeps mixed ready + skipped rows committable', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'existing-tx' })
      .mockResolvedValueOnce(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({ rowNumber: 2, brokerOrderNo: 'BRK-EXISTING' }),
        buildRawRow({ rowNumber: 3, brokerOrderNo: 'BRK-NEW' }),
      ],
      account,
      accountId,
    })

    expect(result).toEqual(
      expect.objectContaining({
        readyCount: 1,
        skippedCount: 1,
        errorCount: 0,
        canCommit: true,
      }),
    )
  })

  it('returns row-level CURRENCY_MISMATCH', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.transaction.findFirst.mockResolvedValue(null)

    const result = await evaluationService.evaluateImportRows({
      rawRows: [buildRawRow({ currency: 'USD' })],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(false)
    expect(result.rows[0].errors[0]).toEqual({
      code: IMPORT_ERROR_CODES.CURRENCY_MISMATCH,
      field: 'currency',
      message: 'Currency USD does not match account currency TWD',
    })
  })

  it('returns row-level UNSUPPORTED_CURRENCY', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.transaction.findFirst.mockResolvedValue(null)

    const result = await evaluationService.evaluateImportRows({
      rawRows: [buildRawRow({ currency: 'HKD' })],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(false)
    expect(result.rows[0].errors[0]).toEqual({
      code: IMPORT_ERROR_CODES.UNSUPPORTED_CURRENCY,
      field: 'currency',
      message: 'Unsupported currency: HKD',
    })
  })

  it('marks newest-first cross-date buy/sell as ready under chronological plan', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({
          rowNumber: 2,
          tradeDate: '2022/01/04',
          netAmount: '3250',
          quantity: '5',
          price: '650',
          brokerOrderNo: 'SELL-NEW',
        }),
        buildRawRow({
          rowNumber: 3,
          tradeDate: '2020/09/28',
          netAmount: '-4335',
          quantity: '10',
          price: '433.5',
          brokerOrderNo: 'BUY-OLD',
        }),
      ],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(true)
    expect(result.readyCount).toBe(2)
    expect(result.errorCount).toBe(0)
    expect(result.rows.every((row) => row.status === 'ready')).toBe(true)
  })

  it('returns SELL_HISTORY_REQUIRED for an orphan sell', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({
          tradeDate: '2022/01/04',
          netAmount: '3250',
          quantity: '5',
          price: '650',
          brokerOrderNo: 'ORPHAN-SELL',
        }),
      ],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(false)
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        errors: [
          expect.objectContaining({
            code: IMPORT_ERROR_CODES.SELL_HISTORY_REQUIRED,
          }),
        ],
      }),
    )
  })

  it('returns SELL_INSUFFICIENT_LOTS when history cannot cover the sell', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'db-buy',
        accountId,
        assetId,
        type: 'buy',
        tradeTime: new Date('2021-01-01T00:00:00+08:00'),
        quantity: 3,
      },
    ])
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({
          tradeDate: '2022/01/04',
          netAmount: '3250',
          quantity: '5',
          price: '650',
          brokerOrderNo: 'OVERSELL',
        }),
      ],
      account,
      accountId,
    })

    expect(result.rows[0].errors[0].code).toBe(
      IMPORT_ERROR_CODES.SELL_INSUFFICIENT_LOTS,
    )
  })

  it('returns SELL_SAME_DAY_ORDER_AMBIGUOUS when sell depends only on same-day buy', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({
          rowNumber: 2,
          tradeDate: '2022/01/04',
          netAmount: '3250',
          quantity: '5',
          price: '650',
          brokerOrderNo: 'SAME-DAY-SELL',
        }),
        buildRawRow({
          rowNumber: 3,
          tradeDate: '2022/01/04',
          netAmount: '-4335',
          quantity: '10',
          price: '433.5',
          brokerOrderNo: 'SAME-DAY-BUY',
        }),
      ],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(true)
    expect(result.readyCount).toBe(1)
    expect(result.errorCount).toBe(1)
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        errors: [
          expect.objectContaining({
            code: IMPORT_ERROR_CODES.SELL_SAME_DAY_ORDER_AMBIGUOUS,
          }),
        ],
      }),
    )
    expect(result.rows[1].status).toBe('ready')
  })

  it('allows canCommit when ready rows coexist with row-local alias errors', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce({ assetId })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({ rowNumber: 2, brokerOrderNo: 'READY-BUY' }),
        buildRawRow({
          rowNumber: 3,
          assetName: '未知標的',
          brokerOrderNo: 'ALIAS-MISS',
        }),
      ],
      account,
      accountId,
    })

    expect(result.readyCount).toBe(1)
    expect(result.errorCount).toBe(1)
    expect(result.canCommit).toBe(true)
  })

  it('keeps file-internal duplicates as commit-blocking even with ready rows', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({ rowNumber: 2, brokerOrderNo: 'BRK-DUP' }),
        buildRawRow({ rowNumber: 3, brokerOrderNo: 'BRK-DUP' }),
        buildRawRow({ rowNumber: 4, brokerOrderNo: 'BRK-OTHER' }),
      ],
      account,
      accountId,
    })

    expect(result.readyCount).toBe(2)
    expect(result.errorCount).toBe(1)
    expect(result.canCommit).toBe(false)
  })

  it('blocks an imported historical sell that would break later DB sell replay', async () => {
    const { evaluationService, prisma } = createHarness()

    prisma.assetAlias.findUnique.mockResolvedValue({ assetId })
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'db-buy',
        accountId,
        assetId,
        type: 'buy',
        tradeTime: new Date('2020-01-01T00:00:00+08:00'),
        quantity: 10,
      },
      {
        id: 'db-sell-later',
        accountId,
        assetId,
        type: 'sell',
        tradeTime: new Date('2022-01-01T00:00:00+08:00'),
        quantity: 10,
      },
    ])
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      symbol: '006208',
      name: '富邦台50',
    })

    const result = await evaluationService.evaluateImportRows({
      rawRows: [
        buildRawRow({
          tradeDate: '2021/01/01',
          netAmount: '3250',
          quantity: '5',
          price: '650',
          brokerOrderNo: 'HIST-IMPORT-SELL',
        }),
      ],
      account,
      accountId,
    })

    expect(result.canCommit).toBe(false)
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        errors: [
          expect.objectContaining({
            code: IMPORT_ERROR_CODES.SELL_INSUFFICIENT_LOTS,
          }),
        ],
      }),
    )
  })
})
