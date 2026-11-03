import { Prisma } from '@prisma/client'
import {
  AssetPerformanceMatch,
  AssetPerformanceSource,
  AssetPerformanceTransaction,
} from './asset-performance.calculator'
import { buildAnnualRealized, taipeiYear } from './annual-realized.calculator'
import { PortfolioAnnualRealizedIssue } from './dto/portfolio-annual-realized.response.dto'

const AS_OF = new Date('2026-06-15T04:00:00.000Z')

function trade(
  partial: Partial<AssetPerformanceTransaction> & Pick<AssetPerformanceTransaction, 'id' | 'type' | 'tradeTime'>,
): AssetPerformanceTransaction {
  return {
    accountId: 'account-twd',
    assetId: 'asset-1',
    amount: new Prisma.Decimal('0'),
    quantity: new Prisma.Decimal('1'),
    ...partial,
  }
}

function match(sellTransactionId: string, quantity: string, unitCost: string): AssetPerformanceMatch {
  return {
    sellTransactionId,
    quantity: new Prisma.Decimal(quantity),
    unitCost: new Prisma.Decimal(unitCost),
  }
}

function source(
  transactions: AssetPerformanceTransaction[],
  matches: AssetPerformanceMatch[] = [],
  accounts: AssetPerformanceSource['accounts'] = [
    { id: 'account-twd', currency: 'TWD' },
    { id: 'account-twd-2', currency: 'twd' },
    { id: 'account-usd', currency: 'USD' },
  ],
): AssetPerformanceSource {
  return {
    accounts,
    transactions,
    lots: [],
    positions: [],
    matches,
    assets: [],
    quotes: [],
  }
}

describe('buildAnnualRealized', () => {
  it('uses the Asia/Taipei year, including the UTC new-year boundary', () => {
    expect(taipeiYear(new Date('2025-12-31T15:59:59.000Z'))).toBe(2025)
    expect(taipeiYear(new Date('2025-12-31T16:00:00.000Z'))).toBe(2026)
  })

  it('assigns a prior-year buy sold this year to the sell year and keeps zero years', () => {
    const result = buildAnnualRealized(source([
      trade({ id: 'buy-2024', type: 'buy', amount: new Prisma.Decimal('1000'), quantity: new Prisma.Decimal('10'), tradeTime: new Date('2024-03-01T00:00:00.000Z') }),
      trade({ id: 'sell-2025', type: 'sell', amount: new Prisma.Decimal('500'), quantity: new Prisma.Decimal('4'), tradeTime: new Date('2025-06-01T00:00:00.000Z') }),
      trade({ id: 'boundary', type: 'sell', amount: new Prisma.Decimal('80'), quantity: new Prisma.Decimal('1'), tradeTime: new Date('2025-12-31T16:00:00.000Z') }),
    ], [
      match('sell-2025', '4', '100'),
      match('boundary', '1', '100'),
    ]), AS_OF)

    expect(result.timeZone).toBe('Asia/Taipei')
    expect(result.items.map(item => [item.year, item.currency, item.sellCount, item.netProceeds, item.disposedCost, item.realizedNetPnl])).toEqual([
      [2026, 'TWD', 1, '80', '100', '-20'],
      [2025, 'TWD', 1, '500', '400', '100'],
      [2024, 'TWD', 0, '0', '0', '0'],
    ])
    expect(result.items.every(item => item.issues)).toEqual(true)
    expect(result.items[2].issues).toEqual([])
  })

  it('does not deduct fees again and keeps split matches as already restated quantities', () => {
    const result = buildAnnualRealized(source([
      trade({ id: 'buy', type: 'buy', amount: new Prisma.Decimal('420'), quantity: new Prisma.Decimal('4'), tradeTime: new Date('2026-01-02T00:00:00.000Z') }),
      trade({ id: 'sell', type: 'sell', amount: new Prisma.Decimal('500'), quantity: new Prisma.Decimal('4'), tradeTime: new Date('2026-04-01T00:00:00.000Z') }),
    ], [
      match('sell', '2', '105'),
      match('sell', '2', '105'),
    ]), AS_OF)

    expect(result.items).toEqual([
      expect.objectContaining({
        year: 2026,
        currency: 'TWD',
        sellCount: 1,
        netProceeds: '500',
        disposedCost: '420',
        realizedNetPnl: '80',
        issues: [],
      }),
    ])
  })

  it('keeps proceeds and nulls the cost when any sell in that year and currency is missing FIFO', () => {
    const result = buildAnnualRealized(source([
      trade({ id: 'buy', type: 'buy', tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      trade({ id: 'bad', type: 'sell', amount: new Prisma.Decimal('500'), quantity: new Prisma.Decimal('4'), tradeTime: new Date('2026-03-01T00:00:00.000Z') }),
      trade({ id: 'good', type: 'sell', amount: new Prisma.Decimal('100'), quantity: new Prisma.Decimal('1'), tradeTime: new Date('2026-04-01T00:00:00.000Z') }),
    ], [
      match('bad', '3', '100'),
      match('good', '1', '100'),
    ]), AS_OF)

    expect(result.items[0]).toMatchObject({
      year: 2026,
      sellCount: 2,
      netProceeds: '600',
      disposedCost: null,
      realizedNetPnl: null,
      issues: [PortfolioAnnualRealizedIssue.MissingFifo],
    })
  })

  it('sums accounts of the same currency and does not mix currencies', () => {
    const result = buildAnnualRealized(source([
      trade({ id: 'buy-a', type: 'buy', tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      trade({ id: 'sell-a', type: 'sell', accountId: 'account-twd', amount: new Prisma.Decimal('10'), quantity: new Prisma.Decimal('1'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
      trade({ id: 'sell-b', type: 'sell', accountId: 'account-twd-2', amount: new Prisma.Decimal('15'), quantity: new Prisma.Decimal('1'), tradeTime: new Date('2026-03-01T00:00:00.000Z') }),
      trade({ id: 'buy-usd', type: 'buy', accountId: 'account-usd', tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      trade({ id: 'sell-usd', type: 'sell', accountId: 'account-usd', amount: new Prisma.Decimal('7'), quantity: new Prisma.Decimal('1'), tradeTime: new Date('2026-05-01T00:00:00.000Z') }),
    ], [
      match('sell-a', '1', '4'),
      match('sell-b', '1', '5'),
      match('sell-usd', '1', '3'),
    ]), AS_OF)

    expect(result.items.map(item => [item.year, item.currency, item.netProceeds, item.realizedNetPnl])).toEqual([
      [2026, 'TWD', '25', '16'],
      [2026, 'USD', '7', '4'],
    ])
  })

  it('rounds the summed decimal half up to 8 places', () => {
    const result = buildAnnualRealized(source([
      trade({ id: 'buy', type: 'buy', tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      trade({ id: 'sell', type: 'sell', amount: new Prisma.Decimal('1.000000005'), quantity: new Prisma.Decimal('1'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
    ], [match('sell', '1', '0')]), AS_OF)

    expect(result.items[0].netProceeds).toBe('1.00000001')
    expect(result.items[0].realizedNetPnl).toBe('1.00000001')
  })

  it('returns no rows when there is no buy or sell', () => {
    const result = buildAnnualRealized(source([
      trade({ id: 'div', type: 'dividend', amount: new Prisma.Decimal('20'), quantity: null, tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
    ]), AS_OF)

    expect(result.items).toEqual([])
  })
})
