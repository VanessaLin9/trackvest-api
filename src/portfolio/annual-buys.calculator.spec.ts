import { AssetType, Prisma } from '@prisma/client'
import { AnnualBuySource, AnnualBuyTrade, buildAnnualBuys, taipeiParts } from './annual-buys.calculator'
import { PortfolioAnnualBuyAssetType } from './dto/portfolio-annual-buys.response.dto'

const AS_OF = new Date('2026-06-15T04:00:00.000Z')

function trade(partial: Partial<AnnualBuyTrade> & Pick<AnnualBuyTrade, 'type' | 'tradeTime'>): AnnualBuyTrade {
  return {
    accountId: 'account-twd',
    assetId: 'equity-1',
    amount: new Prisma.Decimal('0'),
    ...partial,
  }
}

function source(
  trades: AnnualBuyTrade[],
  assets: AnnualBuySource['assets'] = [
    { id: 'equity-1', type: AssetType.equity },
    { id: 'etf-1', type: AssetType.etf },
    { id: 'crypto-1', type: AssetType.crypto },
    { id: 'cash-1', type: AssetType.cash },
  ],
): AnnualBuySource {
  return {
    accounts: [
      { id: 'account-twd', currency: 'TWD' },
      { id: 'account-twd-2', currency: 'twd' },
      { id: 'account-usd', currency: 'USD' },
    ],
    trades,
    assets,
  }
}

describe('buildAnnualBuys', () => {
  it('uses the Asia/Taipei year and month, including the UTC new-year boundary', () => {
    expect(taipeiParts(new Date('2025-12-31T15:59:59.000Z'))).toEqual({ year: 2025, month: 12 })
    expect(taipeiParts(new Date('2025-12-31T16:00:00.000Z'))).toEqual({ year: 2026, month: 1 })
  })

  it('keeps etf separate from equity and fills settled zero years and months', () => {
    const result = buildAnnualBuys(source([
      trade({ type: 'buy', amount: new Prisma.Decimal('100'), tradeTime: new Date('2024-03-01T00:00:00.000Z') }),
      trade({ assetId: 'etf-1', type: 'buy', amount: new Prisma.Decimal('300'), tradeTime: new Date('2026-01-15T00:00:00.000Z') }),
      trade({ assetId: 'crypto-1', type: 'buy', amount: new Prisma.Decimal('50'), tradeTime: new Date('2026-03-01T00:00:00.000Z') }),
      trade({ type: 'sell', amount: new Prisma.Decimal('80'), tradeTime: new Date('2026-03-01T00:00:00.000Z') }),
      trade({ assetId: 'etf-1', type: 'buy', amount: new Prisma.Decimal('1'), tradeTime: new Date('2025-12-31T16:00:00.000Z') }),
    ]), AS_OF)

    const year2026 = result.items.find(item => item.year === 2026 && item.currency === 'TWD')
    const year2025 = result.items.find(item => item.year === 2025 && item.currency === 'TWD')
    const year2024 = result.items.find(item => item.year === 2024 && item.currency === 'TWD')
    expect(year2026).toMatchObject({
      buyCount: 3,
      buyAmount: '351',
      sellCount: 1,
      sellNetProceeds: '80',
      buyMinusSellProceeds: '271',
      types: [
        { type: PortfolioAnnualBuyAssetType.Etf, buyAmount: '301', share: '0.85754986' },
        { type: PortfolioAnnualBuyAssetType.Crypto, buyAmount: '50', share: '0.14245014' },
      ],
    })
    expect(year2026?.months).toHaveLength(6)
    expect(year2026?.months.find(month => month.month === 7)).toBeUndefined()
    expect(year2026?.months[0]).toMatchObject({
      month: 1,
      buyAmount: '301',
      types: [{ type: PortfolioAnnualBuyAssetType.Etf, share: '1' }],
    })
    expect(year2026?.months[1]).toMatchObject({ month: 2, buyAmount: '0', types: [] })
    expect(year2025).toMatchObject({ buyAmount: '0', sellNetProceeds: '0', buyMinusSellProceeds: '0', types: [] })
    expect(year2025?.months).toHaveLength(12)
    expect(year2025?.months.every(month => month.types.length === 0)).toBe(true)
    expect(year2024?.months).toHaveLength(12)
    expect(year2024?.types).toEqual([
      { type: PortfolioAnnualBuyAssetType.Equity, buyAmount: '100', share: '1' },
    ])
  })

  it('keeps crypto and cash, and puts a missing asset in other', () => {
    const result = buildAnnualBuys(source([
      trade({ assetId: 'crypto-1', type: 'buy', amount: new Prisma.Decimal('2'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
      trade({ assetId: 'cash-1', type: 'buy', amount: new Prisma.Decimal('3'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
      trade({ assetId: 'missing', type: 'buy', amount: new Prisma.Decimal('5'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
    ]), AS_OF)

    expect(result.items[0].types.map(type => type.type)).toEqual([
      PortfolioAnnualBuyAssetType.Crypto,
      PortfolioAnnualBuyAssetType.Cash,
      PortfolioAnnualBuyAssetType.Other,
    ])
    expect(result.items[0].buyAmount).toBe('10')
  })

  it('sums accounts of one currency and does not mix currencies', () => {
    const result = buildAnnualBuys(source([
      trade({ accountId: 'account-twd', type: 'buy', amount: new Prisma.Decimal('10'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
      trade({ accountId: 'account-twd-2', type: 'buy', amount: new Prisma.Decimal('15'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
      trade({ accountId: 'account-usd', assetId: 'etf-1', type: 'buy', amount: new Prisma.Decimal('7'), tradeTime: new Date('2026-05-01T00:00:00.000Z') }),
    ]), AS_OF)

    expect(result.items.map(item => [item.year, item.currency, item.buyAmount])).toEqual([
      [2026, 'TWD', '25'],
      [2026, 'USD', '7'],
    ])
  })

  it('leaves shares empty when a year has sells and no buys', () => {
    const result = buildAnnualBuys(source([
      trade({ type: 'buy', tradeTime: new Date('2024-01-01T00:00:00.000Z') }),
      trade({ type: 'sell', amount: new Prisma.Decimal('40'), tradeTime: new Date('2026-04-01T00:00:00.000Z') }),
    ]), AS_OF)

    const year2026 = result.items.find(item => item.year === 2026)
    expect(year2026).toMatchObject({
      buyAmount: '0',
      sellNetProceeds: '40',
      buyMinusSellProceeds: '-40',
      types: [],
    })
    expect(year2026?.months[3].types).toEqual([])
  })

  it('rounds the summed buy amount after adding the months', () => {
    const result = buildAnnualBuys(source([
      trade({ type: 'buy', amount: new Prisma.Decimal('0.000000004'), tradeTime: new Date('2026-01-01T00:00:00.000Z') }),
      trade({ type: 'buy', amount: new Prisma.Decimal('0.000000004'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
    ]), AS_OF)

    expect(result.items[0].months[0].buyAmount).toBe('0')
    expect(result.items[0].months[1].buyAmount).toBe('0')
    expect(result.items[0].buyAmount).toBe('0.00000001')
  })

  it('returns no rows when there is no buy or sell', () => {
    const result = buildAnnualBuys(source([
      trade({ type: 'dividend', amount: new Prisma.Decimal('20'), tradeTime: new Date('2026-02-01T00:00:00.000Z') }),
    ]), AS_OF)

    expect(result.items).toEqual([])
  })
})
