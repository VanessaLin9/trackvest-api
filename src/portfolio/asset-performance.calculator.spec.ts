import { Prisma } from '@prisma/client'
import {
  AssetPerformanceSource,
  buildAssetPerformance,
} from './asset-performance.calculator'
import { PortfolioAssetPerformanceIssue } from './dto/portfolio-asset-performance.response.dto'

const generatedAt = new Date('2026-10-31T00:00:00.000Z')
const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherAccountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const assetId = '11111111-1111-4111-8111-111111111111'
const otherAssetId = '22222222-2222-4222-8222-222222222222'
const buyId = 'buy-1'
const sellId = 'sell-1'
const buyAt = new Date('2025-03-03T01:00:00.000Z')
const sellAt = new Date('2026-06-01T01:00:00.000Z')
const quotedAt = new Date('2026-10-30T00:00:00.000Z')

function decimal(value: string) {
  return new Prisma.Decimal(value)
}

function source(overrides: Partial<AssetPerformanceSource> = {}): AssetPerformanceSource {
  return {
    accounts: [{ id: accountId, currency: 'TWD' }],
    transactions: [
      {
        id: buyId,
        accountId,
        assetId,
        type: 'buy',
        amount: decimal('1000'),
        quantity: decimal('10'),
        tradeTime: buyAt,
      },
    ],
    lots: [
      {
        accountId,
        assetId,
        remainingQuantity: decimal('10'),
        unitCost: decimal('100'),
      },
    ],
    positions: [{ accountId, assetId, quantity: decimal('10') }],
    matches: [],
    assets: [{ id: assetId, symbol: '0050', name: '元大台灣50', baseCurrency: 'TWD' }],
    quotes: [
      { assetId, price: decimal('120'), asOf: quotedAt, source: 'finmind' },
    ],
    ...overrides,
  }
}

function row(input: AssetPerformanceSource = source()) {
  return buildAssetPerformance(input, generatedAt).items[0]
}

describe('asset performance calculator', () => {
  it('nets sell proceeds against FIFO cost without deducting fee or tax again', () => {
    const item = row(source({
      transactions: [
        {
          id: buyId,
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('1050'),
          quantity: decimal('10'),
          tradeTime: buyAt,
        },
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('500'),
          quantity: decimal('4'),
          tradeTime: sellAt,
        },
      ],
      lots: [{ accountId, assetId, remainingQuantity: decimal('6'), unitCost: decimal('105') }],
      positions: [{ accountId, assetId, quantity: decimal('6') }],
      matches: [{ sellTransactionId: sellId, quantity: decimal('4'), unitCost: decimal('105') }],
    }))

    expect(item).toMatchObject({
      status: 'holding',
      quantity: '6',
      realizedQuantity: '4',
      realizedNetPnl: '80',
      remainingCost: '630',
      unrealizedPnl: '90',
      tradeNetPnl: '170',
      issues: [],
    })
  })

  it('keeps a closed position at zero unrealized without a quote', () => {
    const item = row(source({
      transactions: [
        {
          id: buyId,
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('1000'),
          quantity: decimal('10'),
          tradeTime: buyAt,
        },
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('900'),
          quantity: decimal('10'),
          tradeTime: sellAt,
        },
      ],
      lots: [{ accountId, assetId, remainingQuantity: decimal('0'), unitCost: decimal('100') }],
      positions: [],
      matches: [{ sellTransactionId: sellId, quantity: decimal('10'), unitCost: decimal('100') }],
      quotes: [],
    }))

    expect(item).toMatchObject({
      status: 'closed',
      quantity: '0',
      realizedQuantity: '10',
      realizedNetPnl: '-100',
      remainingCost: '0',
      latestPrice: null,
      priceAsOf: null,
      priceSource: null,
      unrealizedPnl: '0',
      tradeNetPnl: '-100',
      issues: [],
    })
  })

  it('distinguishes genuine zero from missing FIFO', () => {
    const zero = row(source({
      quotes: [{ assetId, price: decimal('100'), asOf: quotedAt, source: 'finmind' }],
    }))
    expect(zero).toMatchObject({ realizedQuantity: '0', realizedNetPnl: '0', unrealizedPnl: '0', tradeNetPnl: '0', issues: [] })

    const missing = row(source({
      transactions: [
        ...source().transactions,
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('500'),
          quantity: decimal('4'),
          tradeTime: sellAt,
        },
      ],
      lots: [{ accountId, assetId, remainingQuantity: decimal('6'), unitCost: decimal('100') }],
      positions: [{ accountId, assetId, quantity: decimal('6') }],
      matches: [{ sellTransactionId: sellId, quantity: decimal('2'), unitCost: decimal('100') }],
    }))
    expect(missing).toMatchObject({
      quantity: '6',
      realizedQuantity: null,
      realizedNetPnl: null,
      remainingCost: '600',
      unrealizedPnl: '120',
      tradeNetPnl: null,
      issues: [PortfolioAssetPerformanceIssue.MissingFifo],
    })
  })

  it('nulls valuation when the quote is missing and does not hide the other asset', () => {
    const response = buildAssetPerformance(source({
      transactions: [
        ...source().transactions,
        {
          id: 'buy-2',
          accountId,
          assetId: otherAssetId,
          type: 'buy',
          amount: decimal('50'),
          quantity: decimal('1'),
          tradeTime: buyAt,
        },
      ],
      lots: [
        ...source().lots,
        { accountId, assetId: otherAssetId, remainingQuantity: decimal('1'), unitCost: decimal('50') },
      ],
      positions: [
        ...source().positions,
        { accountId, assetId: otherAssetId, quantity: decimal('1') },
      ],
      assets: [
        ...source().assets,
        { id: otherAssetId, symbol: '2330', name: '台積電', baseCurrency: 'TWD' },
      ],
      quotes: [],
    }), generatedAt)

    expect(response.items.map(item => item.symbol)).toEqual(['0050', '2330'])
    expect(response.items[0]).toMatchObject({
      latestPrice: null,
      unrealizedPnl: null,
      tradeNetPnl: null,
      realizedNetPnl: '0',
      issues: [PortfolioAssetPerformanceIssue.MissingPrice],
    })
    expect(response.items[1].issues).toEqual([PortfolioAssetPerformanceIssue.MissingPrice])
  })

  it('suppresses a foreign quote without also reporting a missing price', () => {
    const item = row(source({
      assets: [{ id: assetId, symbol: 'AAPL', name: 'Apple Inc.', baseCurrency: 'USD' }],
    }))

    expect(item).toMatchObject({
      currency: 'TWD',
      latestPrice: null,
      priceAsOf: null,
      priceSource: null,
      realizedNetPnl: '0',
      remainingCost: '1000',
      unrealizedPnl: null,
      tradeNetPnl: null,
      issues: [PortfolioAssetPerformanceIssue.CurrencyMismatch],
    })
  })

  it('reports a missing price when no quote exists, even if currencies differ', () => {
    const item = row(source({
      assets: [{ id: assetId, symbol: 'AAPL', name: 'Apple Inc.', baseCurrency: 'USD' }],
      quotes: [],
    }))

    expect(item.issues).toEqual([PortfolioAssetPerformanceIssue.MissingPrice])
    expect(item.latestPrice).toBeNull()
  })

  it('ignores a newer seed quote and keeps the older market quote', () => {
    const item = row(source({
      quotes: [
        { assetId, price: decimal('1'), asOf: new Date('2026-10-31T00:00:00.000Z'), source: 'seed' },
        { assetId, price: decimal('120'), asOf: quotedAt, source: 'finmind' },
      ],
    }))

    expect(item).toMatchObject({
      latestPrice: '120',
      priceAsOf: quotedAt.toISOString(),
      priceSource: 'finmind',
      issues: [],
    })
  })

  it('keeps an older positive quote when a newer price is not positive', () => {
    const item = row(source({
      quotes: [
        { assetId, price: decimal('-1'), asOf: new Date('2026-10-31T00:00:00.000Z'), source: 'finmind' },
        { assetId, price: decimal('0'), asOf: new Date('2026-10-31T00:00:00.000Z'), source: 'manual' },
        { assetId, price: decimal('120'), asOf: quotedAt, source: 'finmind' },
      ],
    }))

    expect(item).toMatchObject({
      latestPrice: '120',
      priceAsOf: quotedAt.toISOString(),
      priceSource: 'finmind',
      unrealizedPnl: '200',
      tradeNetPnl: '200',
      issues: [],
    })
  })

  it('reports a missing price when every non-seed quote is non-positive or non-finite', () => {
    const item = row(source({
      quotes: [
        { assetId, price: decimal('-1'), asOf: new Date('2026-10-31T00:00:00.000Z'), source: 'finmind' },
        { assetId, price: decimal('0'), asOf: quotedAt, source: 'finmind' },
        { assetId, price: new Prisma.Decimal('Infinity'), asOf: new Date('2026-10-29T00:00:00.000Z'), source: 'finmind' },
      ],
    }))

    expect(item).toMatchObject({
      latestPrice: null,
      priceAsOf: null,
      priceSource: null,
      unrealizedPnl: null,
      tradeNetPnl: null,
      realizedNetPnl: '0',
      issues: [PortfolioAssetPerformanceIssue.MissingPrice],
    })
  })

  it('treats seed-only quotes as missing prices', () => {
    const item = row(source({
      quotes: [{ assetId, price: decimal('120'), asOf: quotedAt, source: 'seed' }],
    }))

    expect(item).toMatchObject({
      latestPrice: null,
      unrealizedPnl: null,
      issues: [PortfolioAssetPerformanceIssue.MissingPrice],
    })
  })

  it('nulls cost and realized when lots do not match the position, and keeps the lot quantity', () => {
    const item = row(source({
      lots: [{ accountId, assetId, remainingQuantity: decimal('8'), unitCost: decimal('100') }],
      positions: [{ accountId, assetId, quantity: decimal('10') }],
    }))

    expect(item).toMatchObject({
      quantity: '8',
      realizedQuantity: '0',
      remainingCost: null,
      realizedNetPnl: null,
      latestPrice: '120',
      unrealizedPnl: null,
      tradeNetPnl: null,
      issues: [PortfolioAssetPerformanceIssue.InconsistentLots],
    })
  })

  it('keeps P&L when incremental buys leave only float dust on the position', () => {
    const item = row(source({
      transactions: [
        {
          id: buyId,
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('10'),
          quantity: decimal('0.1'),
          tradeTime: buyAt,
        },
        {
          id: 'buy-2',
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('20'),
          quantity: decimal('0.2'),
          tradeTime: new Date('2025-04-01T00:00:00.000Z'),
        },
      ],
      lots: [
        { accountId, assetId, remainingQuantity: decimal('0.1'), unitCost: decimal('100') },
        { accountId, assetId, remainingQuantity: decimal('0.2'), unitCost: decimal('100') },
      ],
      positions: [{ accountId, assetId, quantity: new Prisma.Decimal(0.1 + 0.2) }],
    }))

    expect(new Prisma.Decimal(0.1 + 0.2).eq('0.3')).toBe(false)
    expect(item).toMatchObject({
      quantity: '0.3',
      remainingCost: '30',
      realizedQuantity: '0',
      unrealizedPnl: '6',
      tradeNetPnl: '6',
      issues: [],
    })
  })

  it('still nulls P&L when lot and position differ at the eighth decimal', () => {
    const item = row(source({
      lots: [{ accountId, assetId, remainingQuantity: decimal('0.3'), unitCost: decimal('100') }],
      positions: [{ accountId, assetId, quantity: decimal('0.30000001') }],
    }))

    expect(item).toMatchObject({
      quantity: '0.3',
      remainingCost: null,
      unrealizedPnl: null,
      issues: [PortfolioAssetPerformanceIssue.InconsistentLots],
    })
  })

  it('keeps sold shares when lots are inconsistent but every sell is fully matched', () => {
    const item = row(source({
      transactions: [
        ...source().transactions,
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('400'),
          quantity: decimal('4'),
          tradeTime: sellAt,
        },
      ],
      lots: [{ accountId, assetId, remainingQuantity: decimal('8'), unitCost: decimal('100') }],
      positions: [{ accountId, assetId, quantity: decimal('10') }],
      matches: [
        { sellTransactionId: sellId, quantity: decimal('1.5'), unitCost: decimal('100') },
        { sellTransactionId: sellId, quantity: decimal('2.5'), unitCost: decimal('100') },
      ],
    }))

    expect(item).toMatchObject({
      quantity: '8',
      realizedQuantity: '4',
      realizedNetPnl: null,
      remainingCost: null,
      issues: [PortfolioAssetPerformanceIssue.InconsistentLots],
    })
  })

  it('returns null sold shares when any sell is only partly matched', () => {
    const item = row(source({
      transactions: [
        ...source().transactions,
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('400'),
          quantity: decimal('4'),
          tradeTime: sellAt,
        },
        {
          id: 'sell-2',
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('100'),
          quantity: decimal('1'),
          tradeTime: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
      lots: [{ accountId, assetId, remainingQuantity: decimal('5'), unitCost: decimal('100') }],
      positions: [{ accountId, assetId, quantity: decimal('5') }],
      matches: [{ sellTransactionId: sellId, quantity: decimal('4'), unitCost: decimal('100') }],
    }))

    expect(item.realizedQuantity).toBeNull()
    expect(item.issues).toEqual([PortfolioAssetPerformanceIssue.MissingFifo])
  })

  it('sums matched sell quantities across same-currency accounts and rounds half up once', () => {
    const usdAccountId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const response = buildAssetPerformance(source({
      accounts: [
        { id: accountId, currency: 'TWD' },
        { id: otherAccountId, currency: 'TWD' },
        { id: usdAccountId, currency: 'USD' },
      ],
      transactions: [
        {
          id: buyId,
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('10'),
          quantity: decimal('4'),
          tradeTime: buyAt,
        },
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('4'),
          quantity: decimal('2.000000008'),
          tradeTime: sellAt,
        },
        {
          id: 'buy-2',
          accountId: otherAccountId,
          assetId,
          type: 'buy',
          amount: decimal('3'),
          quantity: decimal('1'),
          tradeTime: buyAt,
        },
        {
          id: 'sell-2',
          accountId: otherAccountId,
          assetId,
          type: 'sell',
          amount: decimal('1'),
          quantity: decimal('1'),
          tradeTime: sellAt,
        },
        {
          id: 'buy-3',
          accountId: usdAccountId,
          assetId,
          type: 'buy',
          amount: decimal('5'),
          quantity: decimal('1'),
          tradeTime: buyAt,
        },
        {
          id: 'sell-3',
          accountId: usdAccountId,
          assetId,
          type: 'sell',
          amount: decimal('2'),
          quantity: decimal('0.5'),
          tradeTime: sellAt,
        },
      ],
      lots: [
        { accountId, assetId, remainingQuantity: decimal('1.999999992'), unitCost: decimal('2.5') },
        { accountId: otherAccountId, assetId, remainingQuantity: decimal('0'), unitCost: decimal('3') },
        { accountId: usdAccountId, assetId, remainingQuantity: decimal('0.5'), unitCost: decimal('5') },
      ],
      positions: [
        { accountId, assetId, quantity: decimal('1.999999992') },
        { accountId: usdAccountId, assetId, quantity: decimal('0.5') },
      ],
      matches: [
        { sellTransactionId: sellId, quantity: decimal('1.000000004'), unitCost: decimal('2.5') },
        { sellTransactionId: sellId, quantity: decimal('1.000000004'), unitCost: decimal('2.5') },
        { sellTransactionId: 'sell-2', quantity: decimal('1'), unitCost: decimal('3') },
        { sellTransactionId: 'sell-3', quantity: decimal('0.5'), unitCost: decimal('5') },
      ],
      assets: [{ id: assetId, symbol: 'AAPL', name: 'Apple Inc.', baseCurrency: 'USD' }],
      quotes: [{ assetId, price: decimal('5'), asOf: quotedAt, source: 'finmind' }],
    }), generatedAt)

    expect(response.items.map(item => item.currency)).toEqual(['TWD', 'USD'])
    expect(response.items[0].realizedQuantity).toBe('3.00000001')
    expect(response.items[1].realizedQuantity).toBe('0.5')
  })

  it('orders combined issues and still returns the healthy row', () => {
    const response = buildAssetPerformance(source({
      transactions: [
        ...source().transactions,
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('500'),
          quantity: decimal('4'),
          tradeTime: sellAt,
        },
        {
          id: 'buy-2',
          accountId,
          assetId: otherAssetId,
          type: 'buy',
          amount: decimal('50'),
          quantity: decimal('1'),
          tradeTime: buyAt,
        },
      ],
      lots: [
        { accountId, assetId, remainingQuantity: decimal('8'), unitCost: decimal('100') },
        { accountId, assetId: otherAssetId, remainingQuantity: decimal('1'), unitCost: decimal('50') },
      ],
      positions: [
        { accountId, assetId, quantity: decimal('10') },
        { accountId, assetId: otherAssetId, quantity: decimal('1') },
      ],
      matches: [],
      assets: [
        { id: assetId, symbol: '0050', name: '元大台灣50', baseCurrency: 'USD' },
        { id: otherAssetId, symbol: '2330', name: '台積電', baseCurrency: 'TWD' },
      ],
      quotes: [{ assetId, price: decimal('120'), asOf: quotedAt, source: 'finmind' }],
    }), generatedAt)

    expect(response.items).toHaveLength(2)
    expect(response.items[0].issues).toEqual([
      PortfolioAssetPerformanceIssue.MissingFifo,
      PortfolioAssetPerformanceIssue.CurrencyMismatch,
      PortfolioAssetPerformanceIssue.InconsistentLots,
    ])
    expect(response.items[1]).toMatchObject({
      symbol: '2330',
      issues: [PortfolioAssetPerformanceIssue.MissingPrice],
    })
  })

  it('uses already adjusted split lots instead of applying the ratio again', () => {
    const item = row(source({
      lots: [{ accountId, assetId, remainingQuantity: decimal('20'), unitCost: decimal('50') }],
      positions: [{ accountId, assetId, quantity: decimal('20') }],
    }))

    expect(item).toMatchObject({
      quantity: '20',
      remainingCost: '1000',
      unrealizedPnl: '1400',
    })
  })

  it('rounds half up only after aggregation and keeps fractional quantity', () => {
    const item = row(source({
      transactions: [
        {
          id: buyId,
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('1.000000015'),
          quantity: decimal('0.5'),
          tradeTime: buyAt,
        },
      ],
      lots: [{ accountId, assetId, remainingQuantity: decimal('0.5'), unitCost: decimal('2.00000003') }],
      positions: [{ accountId, assetId, quantity: decimal('0.5') }],
      quotes: [{ assetId, price: decimal('2'), asOf: quotedAt, source: 'finmind' }],
    }))

    expect(item.quantity).toBe('0.5')
    expect(item.remainingCost).toBe('1.00000002')
    expect(item.unrealizedPnl).toBe('-0.00000002')
  })

  it('aggregates same-currency accounts and keeps a different currency on its own row', () => {
    const response = buildAssetPerformance(source({
      accounts: [
        { id: accountId, currency: 'TWD' },
        { id: otherAccountId, currency: 'TWD' },
        { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', currency: 'usd' },
      ],
      transactions: [
        {
          id: buyId,
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('500'),
          quantity: decimal('5'),
          tradeTime: buyAt,
        },
        {
          id: 'buy-2',
          accountId: otherAccountId,
          assetId,
          type: 'buy',
          amount: decimal('500'),
          quantity: decimal('5'),
          tradeTime: new Date('2025-04-01T00:00:00.000Z'),
        },
        {
          id: 'buy-3',
          accountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          assetId,
          type: 'buy',
          amount: decimal('20'),
          quantity: decimal('1'),
          tradeTime: buyAt,
        },
      ],
      lots: [
        { accountId, assetId, remainingQuantity: decimal('5'), unitCost: decimal('100') },
        { accountId: otherAccountId, assetId, remainingQuantity: decimal('5'), unitCost: decimal('100') },
        {
          accountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          assetId,
          remainingQuantity: decimal('1'),
          unitCost: decimal('20'),
        },
      ],
      positions: [
        { accountId, assetId, quantity: decimal('5') },
        { accountId: otherAccountId, assetId, quantity: decimal('5') },
        { accountId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', assetId, quantity: decimal('1') },
      ],
      assets: [{ id: assetId, symbol: 'AAPL', name: 'Apple Inc.', baseCurrency: 'USD' }],
      quotes: [{ assetId, price: decimal('30'), asOf: quotedAt, source: 'finmind' }],
    }), generatedAt)

    expect(response.items.map(item => item.currency)).toEqual(['TWD', 'USD'])
    expect(response.items[0]).toMatchObject({
      quantity: '10',
      remainingCost: '1000',
      issues: [PortfolioAssetPerformanceIssue.CurrencyMismatch],
    })
    expect(response.items[1]).toMatchObject({
      quantity: '1',
      remainingCost: '20',
      latestPrice: '30',
      unrealizedPnl: '10',
      tradeNetPnl: '10',
      issues: [],
    })
  })

  it('keeps realized history after a close and later reopen', () => {
    const reopenedAt = new Date('2026-08-01T00:00:00.000Z')
    const item = row(source({
      transactions: [
        {
          id: buyId,
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('100'),
          quantity: decimal('2'),
          tradeTime: buyAt,
        },
        {
          id: sellId,
          accountId,
          assetId,
          type: 'sell',
          amount: decimal('80'),
          quantity: decimal('2'),
          tradeTime: sellAt,
        },
        {
          id: 'buy-2',
          accountId,
          assetId,
          type: 'buy',
          amount: decimal('300'),
          quantity: decimal('3'),
          tradeTime: reopenedAt,
        },
      ],
      lots: [
        { accountId, assetId, remainingQuantity: decimal('0'), unitCost: decimal('50') },
        { accountId, assetId, remainingQuantity: decimal('3'), unitCost: decimal('100') },
      ],
      positions: [{ accountId, assetId, quantity: decimal('3') }],
      matches: [{ sellTransactionId: sellId, quantity: decimal('2'), unitCost: decimal('50') }],
      quotes: [{ assetId, price: decimal('120'), asOf: quotedAt, source: 'finmind' }],
    }))

    expect(item).toMatchObject({
      status: 'holding',
      quantity: '3',
      realizedQuantity: '2',
      realizedNetPnl: '-20',
      remainingCost: '300',
      unrealizedPnl: '60',
      tradeNetPnl: '40',
      firstBuyAt: buyAt.toISOString(),
      lastTradeAt: reopenedAt.toISOString(),
      issues: [],
    })
  })

  it('sums recorded dividends separately and does not let them move the last trade', () => {
    const dividendAt = new Date('2026-12-01T00:00:00.000Z')
    const withDividend = row(source({
      transactions: [
        ...source().transactions,
        {
          id: 'div-1',
          accountId,
          assetId,
          type: 'dividend',
          amount: decimal('20'),
          quantity: null,
          tradeTime: dividendAt,
        },
        {
          id: 'div-2',
          accountId,
          assetId,
          type: 'dividend',
          amount: decimal('0'),
          quantity: null,
          tradeTime: dividendAt,
        },
      ],
    }))
    expect(withDividend).toMatchObject({
      recordedDividendAmount: '20',
      recordedDividendCount: 2,
      lastTradeAt: buyAt.toISOString(),
      tradeNetPnl: '200',
    })

    expect(row()).toMatchObject({
      recordedDividendAmount: null,
      recordedDividendCount: 0,
    })
  })

  it('returns no items when the caller has no buy or sell history', () => {
    expect(buildAssetPerformance(source({
      transactions: [],
      lots: [],
      positions: [],
      quotes: [],
    }), generatedAt)).toEqual({
      generatedAt: generatedAt.toISOString(),
      items: [],
    })
  })
})
