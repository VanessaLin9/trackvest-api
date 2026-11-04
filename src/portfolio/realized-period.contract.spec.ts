import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'
import { AssetPerformanceMatch } from './asset-performance.calculator'
import {
  RealizedPeriodSource,
  RealizedPeriodTrade,
  buildRealizedAssets,
  buildRealizedPeriods,
  buildRealizedTrades,
} from './realized-period.calculator'

type FixtureTrade = Omit<
  RealizedPeriodTrade,
  'amount' | 'quantity' | 'price' | 'fee' | 'tax' | 'tradeTime'
> & {
  amount: string
  quantity: string | null
  price: string | null
  fee: string
  tax: string
  tradeTime: string
}

type Fixture = {
  asOf: string
  cases: Array<{
    name: string
    source: {
      accounts: RealizedPeriodSource['accounts']
      assets: RealizedPeriodSource['assets']
      trades: FixtureTrade[]
      matches: Array<{
        sellTransactionId: string
        quantity: string
        unitCost: string
      }>
    }
    scenarios: Record<
      string,
      { query: Record<string, unknown>; response: unknown }
    >
  }>
}

const fixture = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'docs/fixtures/realized-period-performance.fixtures.json',
    ),
    'utf8',
  ),
) as Fixture
const openapi = JSON.parse(
  readFileSync(join(process.cwd(), 'openapi.json'), 'utf8'),
) as {
  paths: Record<string, { get?: { responses?: Record<string, unknown> } }>
}

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function hydrate(
  raw: Fixture['cases'][number]['source'],
): RealizedPeriodSource {
  return {
    accounts: raw.accounts,
    assets: raw.assets,
    trades: raw.trades.map(trade => ({
      ...trade,
      amount: decimal(trade.amount),
      quantity: trade.quantity == null ? null : decimal(trade.quantity),
      price: trade.price == null ? null : decimal(trade.price),
      fee: decimal(trade.fee),
      tax: decimal(trade.tax),
      tradeTime: new Date(trade.tradeTime),
    })),
    matches: raw.matches.map(
      (match): AssetPerformanceMatch => ({
        sellTransactionId: match.sellTransactionId,
        quantity: decimal(match.quantity),
        unitCost: decimal(match.unitCost),
      }),
    ),
  }
}

function build(source: RealizedPeriodSource, query: Record<string, unknown>) {
  const asOf = new Date(fixture.asOf)
  if (typeof query.assetId === 'string')
    return buildRealizedTrades(source, query as never, asOf)
  if (typeof query.currency === 'string')
    return buildRealizedAssets(source, query as never, asOf)
  return buildRealizedPeriods(source, query as never, asOf)
}

describe('realized period fixtures', () => {
  it('publishes the three read routes in OpenAPI', () => {
    const ref = (path: string) => {
      const response = openapi.paths[path]?.get?.responses?.['200'] as {
        content?: { 'application/json'?: { schema?: { $ref?: string } } }
      }
      return response?.content?.['application/json']?.schema?.$ref
    }
    expect(ref('/portfolio/performance/realized/periods')).toBe(
      '#/components/schemas/PortfolioRealizedPeriodsResponseDto',
    )
    expect(ref('/portfolio/performance/realized/assets')).toBe(
      '#/components/schemas/PortfolioRealizedAssetsResponseDto',
    )
    expect(ref('/portfolio/performance/realized/trades')).toBe(
      '#/components/schemas/PortfolioRealizedTradesResponseDto',
    )
  })

  it.each(
    fixture.cases.flatMap(item =>
      Object.keys(item.scenarios).map(name => [item.name, name] as const),
    ),
  )(
    '%s %s matches the calculator for the published source',
    (caseName, scenarioName) => {
      const item = fixture.cases.find(candidate => candidate.name === caseName)
      const scenario = item?.scenarios[scenarioName]
      expect(scenario).toBeDefined()
      expect(build(hydrate(item!.source), scenario!.query)).toEqual(
        scenario!.response,
      )
    },
  )

  it('gives the frontend a two-month chain, two March symbols, and a sell page boundary', () => {
    const chain = fixture.cases.find(item => item.name === 'chain')
    const periods = chain?.scenarios.periods.response as {
      groups: Array<{
        currency: string
        summary: { netProceeds: string; realizedNetPnl: string }
        months: Array<{ month: number; sellCount: number }>
      }>
    }
    const march = chain?.scenarios.assetsMarch.response as {
      items: Array<{ symbol: string }>
      summary: { sellCount: number }
    }
    const page1 = chain?.scenarios.tradesPage1.response as {
      total: number
      items: Array<{
        transactionId: string
        fee: string
        tax: string
        amount: string
      }>
    }
    const page2 = chain?.scenarios.tradesPage2.response as {
      items: Array<{
        transactionId: string
        amount: string
        fee: string
        tax: string
      }>
    }

    const twd = periods.groups.find(group => group.currency === 'TWD')
    expect(twd?.summary).toMatchObject({
      netProceeds: '540',
      realizedNetPnl: '156',
    })
    expect(
      twd?.months
        .filter(month => month.sellCount > 0)
        .map(month => month.month),
    ).toEqual([3, 4])
    expect(periods.groups.map(group => group.currency)).toEqual(['TWD', 'USD'])
    expect(march.items.map(item => item.symbol)).toEqual(['AAA', 'BBB'])
    expect(march.summary.sellCount).toBe(2)
    expect(page1.total).toBe(22)
    expect(page1.items).toHaveLength(20)
    expect(page1.items[0].transactionId).toBe('sell-apr-01')
    expect(page2.items.map(item => item.transactionId)).toEqual([
      'sell-apr-21',
      'sell-mar-aaa',
    ])
    expect(page2.items[1]).toMatchObject({
      amount: '250',
      fee: '1',
      tax: '0.5',
    })
  })

  it('keeps proceeds when FIFO is missing and returns no group for dividends alone', () => {
    const missing = fixture.cases.find(item => item.name === 'missing_fifo')
    const periods = missing?.scenarios.periods.response as {
      groups: Array<{
        summary: {
          netProceeds: string
          disposedCost: string | null
          issues: string[]
        }
        months: Array<{ month: number; realizedNetPnl: string | null }>
      }>
    }
    expect(periods.groups[0].summary).toMatchObject({
      netProceeds: '600',
      disposedCost: null,
      issues: ['MISSING_FIFO'],
    })
    expect(
      periods.groups[0].months.find(month => month.month === 4)?.realizedNetPnl,
    ).toBe('60')

    const empty = fixture.cases.find(item => item.name === 'dividends_only')
    expect(empty?.scenarios.periods.response).toMatchObject({ groups: [] })
    expect(empty?.scenarios.assets.response).toMatchObject({
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
})
