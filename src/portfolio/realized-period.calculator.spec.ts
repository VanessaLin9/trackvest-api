import { Prisma } from '@prisma/client'
import { AssetPerformanceMatch } from './asset-performance.calculator'
import { buildAnnualRealized } from './annual-realized.calculator'
import { formatPerformanceDecimal } from './asset-performance.calculator'
import { PortfolioRealizedPeriodIssue } from './dto/realized-period.response.dto'
import {
  RealizedPeriodQueryError,
  RealizedPeriodSource,
  RealizedPeriodTrade,
  assertRealizedPeriodAllowed,
  buildRealizedAssets,
  buildRealizedPeriods,
  buildRealizedTrades,
  taipeiPeriodEndExclusive,
  taipeiPeriodStart,
} from './realized-period.calculator'

const AS_OF = new Date('2026-06-15T04:00:00.000Z')
const PAGE = { skip: 0, take: 20 }

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function trade(
  partial: Partial<RealizedPeriodTrade> &
    Pick<RealizedPeriodTrade, 'id' | 'type' | 'tradeTime'>,
): RealizedPeriodTrade {
  return {
    accountId: 'account-twd',
    assetId: 'asset-aaa',
    amount: dec('0'),
    quantity: dec('1'),
    price: dec('1'),
    fee: dec('0'),
    tax: dec('0'),
    ...partial,
  }
}

function match(
  sellTransactionId: string,
  quantity: string,
  unitCost: string,
): AssetPerformanceMatch {
  return {
    sellTransactionId,
    quantity: dec(quantity),
    unitCost: dec(unitCost),
  }
}

function source(
  trades: RealizedPeriodTrade[],
  matches: AssetPerformanceMatch[] = [],
  extras: Partial<RealizedPeriodSource> = {},
): RealizedPeriodSource {
  return {
    accounts: [
      { id: 'account-twd', name: 'Broker TWD', currency: 'TWD' },
      { id: 'account-twd-2', name: 'Broker TWD 2', currency: 'twd' },
      { id: 'account-usd', name: 'Broker USD', currency: 'USD' },
    ],
    trades,
    matches,
    assets: [
      { id: 'asset-aaa', symbol: 'AAA', name: 'Alpha', type: 'etf' },
      { id: 'asset-bbb', symbol: 'BBB', name: 'Beta', type: 'equity' },
      { id: 'asset-ccc', symbol: 'CCC', name: 'Gamma', type: 'equity' },
    ],
    ...extras,
  }
}

function chain(): RealizedPeriodSource {
  const aprilSells = Array.from({ length: 21 }, (_, index) => {
    const id = `sell-apr-${String(index + 1).padStart(2, '0')}`
    return trade({
      id,
      type: 'sell',
      amount: dec('10'),
      quantity: dec('1'),
      price: dec('10'),
      tradeTime: new Date('2024-04-10T02:00:00.000Z'),
    })
  })
  return source(
    [
      trade({
        id: 'buy-2023',
        type: 'buy',
        amount: dec('10000'),
        quantity: dec('100'),
        tradeTime: new Date('2023-11-01T02:00:00.000Z'),
      }),
      trade({
        id: 'sell-mar-aaa',
        type: 'sell',
        amount: dec('250'),
        quantity: dec('2'),
        price: dec('125'),
        fee: dec('1'),
        tax: dec('0.5'),
        tradeTime: new Date('2024-03-15T02:00:00.000Z'),
      }),
      trade({
        id: 'sell-mar-bbb',
        type: 'sell',
        assetId: 'asset-bbb',
        amount: dec('80'),
        quantity: dec('1'),
        price: dec('80'),
        tradeTime: new Date('2024-03-16T02:00:00.000Z'),
      }),
      ...aprilSells,
      trade({
        id: 'buy-usd',
        type: 'buy',
        accountId: 'account-usd',
        assetId: 'asset-ccc',
        amount: dec('3'),
        quantity: dec('1'),
        tradeTime: new Date('2024-01-05T02:00:00.000Z'),
      }),
      trade({
        id: 'sell-usd',
        type: 'sell',
        accountId: 'account-usd',
        assetId: 'asset-ccc',
        amount: dec('7'),
        quantity: dec('1'),
        price: dec('7'),
        tradeTime: new Date('2024-03-20T02:00:00.000Z'),
      }),
      trade({
        id: 'dividend',
        type: 'dividend',
        amount: dec('20'),
        quantity: null,
        price: null,
        tradeTime: new Date('2024-05-01T02:00:00.000Z'),
      }),
    ],
    [
      match('sell-mar-aaa', '1', '100'),
      match('sell-mar-aaa', '1', '100'),
      match('sell-mar-bbb', '1', '100'),
      ...aprilSells.map(sell => match(sell.id, '1', '4')),
      match('sell-usd', '1', '3'),
    ],
  )
}

describe('realized period calendar', () => {
  it('places Taipei month and year boundaries without using the host timezone', () => {
    expect(taipeiPeriodStart(2024, null).toISOString()).toBe(
      '2023-12-31T16:00:00.000Z',
    )
    expect(taipeiPeriodEndExclusive(2024, null).toISOString()).toBe(
      '2024-12-31T16:00:00.000Z',
    )
    expect(taipeiPeriodStart(2024, 3).toISOString()).toBe(
      '2024-02-29T16:00:00.000Z',
    )
    expect(taipeiPeriodEndExclusive(2024, 3).toISOString()).toBe(
      '2024-03-31T16:00:00.000Z',
    )
    expect(taipeiPeriodEndExclusive(2025, 2).toISOString()).toBe(
      '2025-02-28T16:00:00.000Z',
    )

    const boundary = source(
      [
        trade({
          id: 'dec',
          type: 'sell',
          amount: dec('1'),
          tradeTime: new Date('2025-12-31T15:59:59.999Z'),
        }),
        trade({
          id: 'jan',
          type: 'sell',
          amount: dec('2'),
          tradeTime: new Date('2025-12-31T16:00:00.000Z'),
        }),
        trade({
          id: 'jan-end',
          type: 'sell',
          amount: dec('3'),
          tradeTime: new Date('2026-01-31T15:59:59.999Z'),
        }),
        trade({
          id: 'feb',
          type: 'sell',
          amount: dec('4'),
          tradeTime: new Date('2026-01-31T16:00:00.000Z'),
        }),
        trade({
          id: 'leap',
          type: 'sell',
          amount: dec('5'),
          tradeTime: new Date('2024-02-29T15:59:59.999Z'),
        }),
        trade({
          id: 'after-leap',
          type: 'sell',
          amount: dec('6'),
          tradeTime: new Date('2024-02-29T16:00:00.000Z'),
        }),
      ],
      [
        match('dec', '1', '0'),
        match('jan', '1', '0'),
        match('jan-end', '1', '0'),
        match('feb', '1', '0'),
        match('leap', '1', '0'),
        match('after-leap', '1', '0'),
      ],
    )

    const year2025 = buildRealizedPeriods(
      boundary,
      { accountId: null, year: 2025 },
      AS_OF,
    )
    const year2026 = buildRealizedPeriods(
      boundary,
      { accountId: null, year: 2026 },
      AS_OF,
    )
    const year2024 = buildRealizedPeriods(
      boundary,
      { accountId: null, year: 2024 },
      AS_OF,
    )
    expect(year2025.groups[0].months[11]).toMatchObject({
      month: 12,
      netProceeds: '1',
    })
    expect(year2026.groups[0].months[0]).toMatchObject({
      month: 1,
      netProceeds: '5',
    })
    expect(year2026.groups[0].months[1]).toMatchObject({
      month: 2,
      netProceeds: '4',
    })
    expect(year2024.groups[0].months[1]).toMatchObject({
      month: 2,
      netProceeds: '5',
    })
    expect(year2024.groups[0].months[2]).toMatchObject({
      month: 3,
      netProceeds: '6',
    })
  })

  it('rejects a future year or a month that has not started', () => {
    expect(() =>
      assertRealizedPeriodAllowed({ year: 2027, month: null }, AS_OF),
    ).toThrow(RealizedPeriodQueryError)
    expect(() =>
      assertRealizedPeriodAllowed({ year: 2026, month: 7 }, AS_OF),
    ).toThrow(/month has not started/)
    expect(() =>
      assertRealizedPeriodAllowed({ year: 2026, month: 6 }, AS_OF),
    ).not.toThrow()
    expect(() =>
      assertRealizedPeriodAllowed({ year: 2024, month: 12 }, AS_OF),
    ).not.toThrow()
  })
})

describe('buildRealizedPeriods', () => {
  it('returns the closed-year chain, keeps a partial sell, and does not deduct fees again', () => {
    const result = buildRealizedPeriods(
      chain(),
      { accountId: 'account-twd', year: 2024 },
      AS_OF,
    )
    const twd = result.groups.find(group => group.currency === 'TWD')
    const usd = result.groups.find(group => group.currency === 'USD')

    expect(result.timeZone).toBe('Asia/Taipei')
    expect(result.scope).toEqual({
      accountId: 'account-twd',
      year: 2024,
      month: null,
      currency: null,
    })
    expect(result.periodStart).toBe('2023-12-31T16:00:00.000Z')
    expect(result.periodEndExclusive).toBe('2024-12-31T16:00:00.000Z')
    expect(result.asOf).toBeNull()
    expect(result.isCurrentYear).toBe(false)
    expect(result.groups.map(group => group.currency)).toEqual(['TWD', 'USD'])
    expect(twd?.months).toHaveLength(12)
    expect(twd?.months.every(month => month.isCurrentMonth)).toBe(false)
    expect(twd?.months[2]).toMatchObject({
      month: 3,
      sellCount: 2,
      netProceeds: '330',
      disposedCost: '300',
      realizedNetPnl: '30',
      issues: [],
    })
    expect(twd?.months[3]).toMatchObject({
      month: 4,
      sellCount: 21,
      netProceeds: '210',
      disposedCost: '84',
      realizedNetPnl: '126',
      issues: [],
    })
    expect(twd?.months[0]).toMatchObject({
      sellCount: 0,
      netProceeds: '0',
      disposedCost: '0',
      realizedNetPnl: '0',
      issues: [],
    })
    expect(twd?.summary).toEqual({
      sellCount: 23,
      netProceeds: '540',
      disposedCost: '384',
      realizedNetPnl: '156',
      issues: [],
    })
    expect(usd?.summary).toEqual({
      sellCount: 1,
      netProceeds: '7',
      disposedCost: '3',
      realizedNetPnl: '4',
      issues: [],
    })
  })

  it('stops the current year at the Taipei month and excludes a later trade that annual realized still includes', () => {
    const future = source(
      [
        trade({
          id: 'buy',
          type: 'buy',
          tradeTime: new Date('2026-01-02T00:00:00.000Z'),
        }),
        trade({ id: 'now', type: 'sell', amount: dec('10'), tradeTime: AS_OF }),
        trade({
          id: 'later',
          type: 'sell',
          amount: dec('99'),
          tradeTime: new Date(AS_OF.getTime() + 1),
        }),
        trade({
          id: 'july',
          type: 'sell',
          amount: dec('40'),
          tradeTime: new Date('2026-07-01T02:00:00.000Z'),
        }),
      ],
      [
        match('now', '1', '4'),
        match('later', '1', '4'),
        match('july', '1', '4'),
      ],
    )

    const periods = buildRealizedPeriods(
      future,
      { accountId: null, year: 2026 },
      AS_OF,
    )
    const annual = buildAnnualRealized(
      {
        accounts: future.accounts,
        transactions: future.trades,
        lots: [],
        positions: [],
        matches: future.matches,
        assets: [],
        quotes: [],
      },
      AS_OF,
    )

    expect(periods.isCurrentYear).toBe(true)
    expect(periods.asOf).toBe(AS_OF.toISOString())
    expect(periods.groups[0].months).toHaveLength(6)
    expect(periods.groups[0].months[5].isCurrentMonth).toBe(true)
    expect(periods.groups[0].months.map(month => month.month)).toEqual([
      1, 2, 3, 4, 5, 6,
    ])
    expect(periods.groups[0].summary).toMatchObject({
      sellCount: 1,
      netProceeds: '10',
      realizedNetPnl: '6',
    })
    expect(
      annual.items.find(item => item.year === 2026 && item.currency === 'TWD'),
    ).toMatchObject({
      sellCount: 3,
      netProceeds: '149',
    })
  })

  it('opens a group from the first buy or sell and keeps a later year with no sells at zero', () => {
    const bought = source([
      trade({
        id: 'buy',
        type: 'buy',
        tradeTime: new Date('2023-02-01T00:00:00.000Z'),
      }),
    ])
    const result = buildRealizedPeriods(
      bought,
      { accountId: null, year: 2024 },
      AS_OF,
    )
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].summary).toEqual({
      sellCount: 0,
      netProceeds: '0',
      disposedCost: '0',
      realizedNetPnl: '0',
      issues: [],
    })
    expect(
      buildRealizedPeriods(bought, { accountId: null, year: 2022 }, AS_OF)
        .groups,
    ).toEqual([])
  })

  it('does not open a year for dividends or for a currency with no buy or sell', () => {
    const dividends = source([
      trade({
        id: 'div',
        type: 'dividend',
        amount: dec('20'),
        quantity: null,
        price: null,
        tradeTime: new Date('2024-02-01T00:00:00.000Z'),
      }),
    ])
    expect(
      buildRealizedPeriods(dividends, { accountId: null, year: 2024 }, AS_OF)
        .groups,
    ).toEqual([])
  })

  it('nulls only the affected month and the year when one sell is short a match', () => {
    const result = buildRealizedPeriods(
      source(
        [
          trade({
            id: 'buy',
            type: 'buy',
            tradeTime: new Date('2024-01-01T00:00:00.000Z'),
          }),
          trade({
            id: 'bad',
            type: 'sell',
            amount: dec('500'),
            quantity: dec('4'),
            tradeTime: new Date('2024-03-01T00:00:00.000Z'),
          }),
          trade({
            id: 'good',
            type: 'sell',
            assetId: 'asset-bbb',
            amount: dec('100'),
            quantity: dec('1'),
            tradeTime: new Date('2024-04-01T00:00:00.000Z'),
          }),
        ],
        [match('bad', '3', '100'), match('good', '1', '40')],
      ),
      { accountId: null, year: 2024 },
      AS_OF,
    )

    expect(result.groups[0].months[2]).toMatchObject({
      month: 3,
      sellCount: 1,
      netProceeds: '500',
      disposedCost: null,
      realizedNetPnl: null,
      issues: [PortfolioRealizedPeriodIssue.MissingFifo],
    })
    expect(result.groups[0].months[3]).toMatchObject({
      month: 4,
      netProceeds: '100',
      disposedCost: '40',
      realizedNetPnl: '60',
      issues: [],
    })
    expect(result.groups[0].summary).toMatchObject({
      sellCount: 2,
      netProceeds: '600',
      disposedCost: null,
      realizedNetPnl: null,
      issues: [PortfolioRealizedPeriodIssue.MissingFifo],
    })
  })

  it('sums unrounded month amounts into the year and documents last-digit display drift', () => {
    const tiny = source(
      [
        trade({
          id: 'buy',
          type: 'buy',
          tradeTime: new Date('2024-01-01T00:00:00.000Z'),
        }),
        trade({
          id: 'm1',
          type: 'sell',
          amount: dec('0.000000004'),
          tradeTime: new Date('2024-01-15T00:00:00.000Z'),
        }),
        trade({
          id: 'm2',
          type: 'sell',
          amount: dec('0.000000004'),
          tradeTime: new Date('2024-02-15T00:00:00.000Z'),
        }),
        trade({
          id: 'm3',
          type: 'sell',
          amount: dec('0.000000004'),
          tradeTime: new Date('2024-03-15T00:00:00.000Z'),
        }),
      ],
      [match('m1', '1', '0'), match('m2', '1', '0'), match('m3', '1', '0')],
    )
    const result = buildRealizedPeriods(
      tiny,
      { accountId: null, year: 2024 },
      AS_OF,
    )
    const unrounded = dec('0.000000004').add('0.000000004').add('0.000000004')
    expect(result.groups[0].summary.netProceeds).toBe(
      formatPerformanceDecimal(unrounded),
    )
    expect(
      result.groups[0].months.slice(0, 3).map(month => month.netProceeds),
    ).toEqual(['0', '0', '0'])
    expect(result.groups[0].summary.netProceeds).toBe('0.00000001')
  })
})

describe('buildRealizedAssets', () => {
  it('lists both holding and closed symbols, merges same-currency accounts, and keeps currencies apart', () => {
    const data = chain()
    data.trades.push(
      trade({
        id: 'sell-other-account',
        type: 'sell',
        accountId: 'account-twd-2',
        assetId: 'asset-bbb',
        amount: dec('20'),
        quantity: dec('1'),
        price: dec('20'),
        tradeTime: new Date('2024-03-17T02:00:00.000Z'),
      }),
    )
    data.matches.push(match('sell-other-account', '1', '10'))
    data.trades.push(
      trade({
        id: 'buy-only',
        type: 'buy',
        assetId: 'asset-unused',
        tradeTime: new Date('2024-03-01T00:00:00.000Z'),
      }),
    )

    const year = buildRealizedAssets(
      data,
      { accountId: null, year: 2024, month: null, currency: 'twd', ...PAGE },
      AS_OF,
    )
    expect(year.scope).toEqual({
      accountId: null,
      year: 2024,
      month: null,
      currency: 'TWD',
    })
    expect(year.asOf).toBeNull()
    expect(year.summary).toEqual({
      sellCount: 24,
      netProceeds: '560',
      disposedCost: '394',
      realizedNetPnl: '166',
      issues: [],
    })
    expect(year.total).toBe(2)
    expect(year.items.map(item => item.symbol)).toEqual(['AAA', 'BBB'])
    expect(year.items[0]).toMatchObject({
      assetId: 'asset-aaa',
      type: 'etf',
      sellCount: 22,
      realizedQuantity: '23',
      netProceeds: '460',
      disposedCost: '284',
      realizedNetPnl: '176',
      issues: [],
    })
    expect(year.items[1]).toMatchObject({
      sellCount: 2,
      realizedQuantity: '2',
      netProceeds: '100',
      disposedCost: '110',
      realizedNetPnl: '-10',
    })

    const march = buildRealizedAssets(
      data,
      { accountId: null, year: 2024, month: 3, currency: 'TWD', ...PAGE },
      AS_OF,
    )
    expect(march.periodStart).toBe('2024-02-29T16:00:00.000Z')
    expect(march.periodEndExclusive).toBe('2024-03-31T16:00:00.000Z')
    expect(march.summary.netProceeds).toBe('350')
    expect(march.items.map(item => item.symbol)).toEqual(['AAA', 'BBB'])

    const usd = buildRealizedAssets(
      data,
      { accountId: null, year: 2024, month: null, currency: 'USD', ...PAGE },
      AS_OF,
    )
    expect(usd.items.map(item => item.assetId)).toEqual(['asset-ccc'])
    expect(usd.summary.realizedNetPnl).toBe('4')
    expect(
      buildRealizedAssets(
        data,
        { accountId: null, year: 2024, month: null, currency: 'JPY', ...PAGE },
        AS_OF,
      ),
    ).toMatchObject({
      items: [],
      total: 0,
      summary: {
        sellCount: 0,
        netProceeds: '0',
        disposedCost: '0',
        realizedNetPnl: '0',
        issues: [],
      },
    })
  })

  it('nulls one asset without hiding another and pages without changing the summary', () => {
    const sells = Array.from({ length: 21 }, (_, index) =>
      trade({
        id: `sell-${String(index + 1).padStart(2, '0')}`,
        type: 'sell',
        assetId: `asset-${String(index + 1).padStart(2, '0')}`,
        amount: dec('10'),
        quantity: dec('1'),
        tradeTime: new Date(
          `2024-03-${String((index % 28) + 1).padStart(2, '0')}T02:00:00.000Z`,
        ),
      }),
    )
    const data = source(
      sells,
      sells.map(sell => match(sell.id, '1', '4')),
      {
        assets: sells.map((sell, index) => ({
          id: sell.assetId,
          symbol:
            index === 20 ? 'ZZZ' : `S${String(index + 1).padStart(2, '0')}`,
          name: sell.assetId,
          type: 'equity',
        })),
      },
    )
    data.trades.push(
      trade({
        id: 'buy',
        type: 'buy',
        tradeTime: new Date('2024-01-01T00:00:00.000Z'),
      }),
    )
    data.matches[20] = match('sell-21', '0.5', '4')

    const page = buildRealizedAssets(
      data,
      {
        accountId: null,
        year: 2024,
        month: 3,
        currency: 'TWD',
        skip: 0,
        take: 20,
      },
      AS_OF,
    )
    const next = buildRealizedAssets(
      data,
      {
        accountId: null,
        year: 2024,
        month: 3,
        currency: 'TWD',
        skip: 20,
        take: 20,
      },
      AS_OF,
    )
    expect(page.total).toBe(21)
    expect(page.items).toHaveLength(20)
    expect(next.items).toHaveLength(1)
    expect(page.summary).toEqual(next.summary)
    expect(page.summary).toMatchObject({
      sellCount: 21,
      netProceeds: '210',
      disposedCost: null,
      realizedNetPnl: null,
      issues: ['MISSING_FIFO'],
    })
    expect(page.items.find(item => item.assetId === 'asset-21')).toBeUndefined()
    expect(next.items[0]).toMatchObject({
      assetId: 'asset-21',
      realizedQuantity: null,
      realizedNetPnl: null,
    })
    expect(
      page.items.every(
        item => item.assetId === 'asset-21' || item.realizedNetPnl === '6',
      ),
    ).toBe(true)
    expect(page.items.map(item => item.symbol)).toEqual(
      [...page.items.map(item => item.symbol)].sort(),
    )
  })

  it('rounds half up to 8 places and keeps integers past the JavaScript safe range', () => {
    const rounded = buildRealizedAssets(
      source(
        [
          trade({
            id: 'buy',
            type: 'buy',
            tradeTime: new Date('2024-01-01T00:00:00.000Z'),
          }),
          trade({
            id: 'sell',
            type: 'sell',
            amount: dec('1.000000005'),
            quantity: dec('1'),
            tradeTime: new Date('2024-03-01T00:00:00.000Z'),
          }),
        ],
        [match('sell', '1', '0')],
      ),
      { accountId: null, year: 2024, month: null, currency: 'TWD', ...PAGE },
      AS_OF,
    )
    const large = buildRealizedAssets(
      source(
        [
          trade({
            id: 'buy',
            type: 'buy',
            tradeTime: new Date('2024-01-01T00:00:00.000Z'),
          }),
          trade({
            id: 'sell',
            type: 'sell',
            amount: dec('9007199254740993'),
            quantity: dec('1'),
            tradeTime: new Date('2024-03-01T00:00:00.000Z'),
          }),
        ],
        [match('sell', '1', '2')],
      ),
      { accountId: null, year: 2024, month: null, currency: 'TWD', ...PAGE },
      AS_OF,
    )

    expect(rounded.summary.netProceeds).toBe('1.00000001')
    expect(rounded.summary.realizedNetPnl).toBe('1.00000001')
    expect(large.summary).toMatchObject({
      netProceeds: '9007199254740993',
      disposedCost: '2',
      realizedNetPnl: '9007199254740991',
    })
  })
})

describe('buildRealizedTrades', () => {
  it('returns one row per sell, keeps fee and tax beside net proceeds, and pages a stable order', () => {
    const data = chain()
    const first = buildRealizedTrades(
      data,
      {
        accountId: null,
        year: 2024,
        month: null,
        currency: 'TWD',
        assetId: 'asset-aaa',
        skip: 0,
        take: 20,
      },
      AS_OF,
    )
    const second = buildRealizedTrades(
      data,
      {
        accountId: null,
        year: 2024,
        month: null,
        currency: 'TWD',
        assetId: 'asset-aaa',
        skip: 20,
        take: 20,
      },
      AS_OF,
    )

    expect(first.scope).toEqual({
      accountId: null,
      year: 2024,
      month: null,
      currency: 'TWD',
      assetId: 'asset-aaa',
    })
    expect(first.total).toBe(22)
    expect(first.items).toHaveLength(20)
    expect(second.items.map(item => item.transactionId)).toEqual([
      'sell-apr-21',
      'sell-mar-aaa',
    ])
    expect(first.summary).toEqual(second.summary)
    expect(first.summary).toEqual({
      sellCount: 22,
      netProceeds: '460',
      disposedCost: '284',
      realizedNetPnl: '176',
      issues: [],
    })
    expect(first.items[0]).toMatchObject({
      transactionId: 'sell-apr-01',
      type: 'sell',
      quantity: '1',
      price: '10',
      amount: '10',
      fee: '0',
      tax: '0',
      disposedCost: '4',
      realizedNetPnl: '6',
    })
    expect(second.items[1]).toMatchObject({
      transactionId: 'sell-mar-aaa',
      accountName: 'Broker TWD',
      amount: '250',
      fee: '1',
      tax: '0.5',
      quantity: '2',
      disposedCost: '200',
      realizedNetPnl: '50',
      issues: [],
    })
    expect(first.items.map(item => item.transactionId).slice(0, 20)).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `sell-apr-${String(index + 1).padStart(2, '0')}`,
      ),
    )
  })

  it('keeps a null price and uses the stored split or cash-in-lieu quantity without applying another ratio', () => {
    const result = buildRealizedTrades(
      source(
        [
          trade({
            id: 'buy',
            type: 'buy',
            quantity: dec('10'),
            tradeTime: new Date('2023-01-01T00:00:00.000Z'),
          }),
          trade({
            id: 'split-sell',
            type: 'sell',
            amount: dec('80'),
            quantity: dec('20'),
            price: null,
            tradeTime: new Date('2024-06-01T00:00:00.000Z'),
          }),
        ],
        [match('split-sell', '12', '2'), match('split-sell', '8', '2')],
      ),
      {
        accountId: null,
        year: 2024,
        month: null,
        currency: 'TWD',
        assetId: 'asset-aaa',
        ...PAGE,
      },
      AS_OF,
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      quantity: '20',
      price: null,
      amount: '80',
      disposedCost: '40',
      realizedNetPnl: '40',
      issues: [],
    })
  })

  it('nulls the whole-period summary when the missing match is on another page', () => {
    const sells = Array.from({ length: 21 }, (_, index) =>
      trade({
        id: `sell-${String(index + 1).padStart(2, '0')}`,
        type: 'sell',
        amount: dec('10'),
        quantity: index === 20 ? dec('4') : dec('1'),
        tradeTime: new Date('2024-04-10T02:00:00.000Z'),
      }),
    )
    const data = source(
      [
        trade({
          id: 'buy',
          type: 'buy',
          tradeTime: new Date('2024-01-01T00:00:00.000Z'),
        }),
        ...sells,
      ],
      sells.map((sell, index) => match(sell.id, index === 20 ? '1' : '1', '4')),
    )
    const page = buildRealizedTrades(
      data,
      {
        accountId: null,
        year: 2024,
        month: null,
        currency: 'TWD',
        assetId: 'asset-aaa',
        skip: 0,
        take: 20,
      },
      AS_OF,
    )

    expect(page.items.every(item => item.issues.length === 0)).toBe(true)
    expect(page.summary).toMatchObject({
      sellCount: 21,
      netProceeds: '210',
      disposedCost: null,
      realizedNetPnl: null,
      issues: [PortfolioRealizedPeriodIssue.MissingFifo],
    })
    expect(
      buildRealizedTrades(
        data,
        {
          accountId: null,
          year: 2024,
          month: null,
          currency: 'TWD',
          assetId: 'missing-asset',
          ...PAGE,
        },
        AS_OF,
      ),
    ).toMatchObject({
      items: [],
      total: 0,
      summary: {
        sellCount: 0,
        netProceeds: '0',
        disposedCost: '0',
        realizedNetPnl: '0',
        issues: [],
      },
    })
  })

  it('returns a null quantity instead of zero when the sell has no quantity', () => {
    const result = buildRealizedTrades(
      source([
        trade({
          id: 'buy',
          type: 'buy',
          tradeTime: new Date('2024-01-01T00:00:00.000Z'),
        }),
        trade({
          id: 'blank',
          type: 'sell',
          amount: dec('15'),
          quantity: null,
          price: null,
          tradeTime: new Date('2024-04-01T00:00:00.000Z'),
        }),
      ]),
      {
        accountId: null,
        year: 2024,
        month: null,
        currency: 'TWD',
        assetId: 'asset-aaa',
        ...PAGE,
      },
      AS_OF,
    )

    expect(result.items[0]).toMatchObject({
      quantity: null,
      price: null,
      amount: '15',
      disposedCost: null,
      realizedNetPnl: null,
      issues: [PortfolioRealizedPeriodIssue.MissingFifo],
    })
  })
})

describe('realized period reconciliation', () => {
  it('matches month totals, asset totals, trade totals, and annual realized for a closed year', () => {
    const data = chain()
    const periods = buildRealizedPeriods(
      data,
      { accountId: null, year: 2024 },
      AS_OF,
    )
    const assets = buildRealizedAssets(
      data,
      {
        accountId: null,
        year: 2024,
        month: null,
        currency: 'TWD',
        skip: 0,
        take: 100,
      },
      AS_OF,
    )
    const twd = periods.groups.find(group => group.currency === 'TWD')
    expect(twd).toBeDefined()
    expect(assets.summary).toEqual(twd?.summary)

    const monthProceeds = twd!.months.reduce(
      (total, month) => total.add(month.netProceeds),
      dec('0'),
    )
    expect(monthProceeds.toString()).toBe(twd?.summary.netProceeds)

    const assetProceeds = assets.items.reduce(
      (total, item) => total.add(item.netProceeds),
      dec('0'),
    )
    expect(assetProceeds.toString()).toBe(assets.summary.netProceeds)

    const trades = buildRealizedTrades(
      data,
      {
        accountId: null,
        year: 2024,
        month: null,
        currency: 'TWD',
        assetId: 'asset-aaa',
        skip: 0,
        take: 100,
      },
      AS_OF,
    )
    const tradeProceeds = trades.items.reduce(
      (total, item) => total.add(item.amount),
      dec('0'),
    )
    expect(tradeProceeds.toString()).toBe(assets.items[0].netProceeds)
    expect(trades.summary).toMatchObject({
      sellCount: assets.items[0].sellCount,
      netProceeds: assets.items[0].netProceeds,
      disposedCost: assets.items[0].disposedCost,
      realizedNetPnl: assets.items[0].realizedNetPnl,
    })

    const annual = buildAnnualRealized(
      {
        accounts: data.accounts,
        transactions: data.trades,
        lots: [],
        positions: [],
        matches: data.matches,
        assets: [],
        quotes: [],
      },
      AS_OF,
    )
    for (const group of periods.groups) {
      expect(
        annual.items.find(
          item => item.year === 2024 && item.currency === group.currency,
        ),
      ).toMatchObject(group.summary)
    }
  })
})
