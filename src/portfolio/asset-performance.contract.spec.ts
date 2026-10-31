import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validate } from 'class-validator'
import { Prisma } from '@prisma/client'
import { GetPortfolioAssetPerformanceDto } from './dto/get-portfolio-asset-performance.dto'
import {
  PortfolioAssetPerformanceIssue,
  PortfolioAssetPerformanceResponseDto,
  PortfolioAssetPerformanceStatus,
} from './dto/portfolio-asset-performance.response.dto'

const fixture = JSON.parse(readFileSync(join(process.cwd(), 'docs/fixtures/asset-history-performance.fixtures.json'), 'utf8')) as {
  contract: { method: string; path: string; query: { accountId: string } }
  scenarios: Record<string, PortfolioAssetPerformanceResponseDto>
}
const openapi = JSON.parse(readFileSync(join(process.cwd(), 'openapi.json'), 'utf8')) as {
  components: { schemas: { PortfolioAssetPerformanceItemResponseDto: { properties: Record<string, unknown> } } }
}
type Row = PortfolioAssetPerformanceResponseDto['items'][number]

describe('asset history performance CP0 contract', () => {
  it('declares the future read route and optional account scope', () => {
    expect(fixture.contract).toEqual({
      method: 'GET', path: '/portfolio/performance/assets', query: { accountId: 'optional UUID' },
    })
  })

  it.each([undefined, '11111111-1111-4111-8111-111111111111'])('accepts an omitted or UUID accountId', async (accountId) => {
    const query = Object.assign(new GetPortfolioAssetPerformanceDto(), { accountId })
    await expect(validate(query)).resolves.toEqual([])
  })

  it.each(['', 'not-an-account', '123'])('rejects an invalid accountId', async (accountId) => {
    const errors = await validate(Object.assign(new GetPortfolioAssetPerformanceDto(), { accountId }))
    expect(errors).toHaveLength(1)
    expect(errors[0].constraints).toHaveProperty('isUuid')
  })

  it.each(Object.keys(fixture.scenarios))('%s preserves decimal strings, dates, nulls, ordering and financial meaning', (name) => {
    const response = fixture.scenarios[name]
    expect(new Date(response.generatedAt).toISOString()).toBe(response.generatedAt)
    const keys = response.items.map(row => `${row.symbol}:${row.currency}:${row.assetId}`)
    expect(keys).toEqual([...keys].sort())
    expect(new Set(response.items.map(row => `${row.assetId}:${row.currency}`)).size).toBe(response.items.length)
    for (const row of response.items) {
      expect(Object.keys(row).sort()).toEqual(Object.keys(openapi.components.schemas.PortfolioAssetPerformanceItemResponseDto.properties).sort())
      const decimals: Array<keyof Row> = ['quantity', 'realizedNetPnl', 'remainingCost', 'latestPrice', 'unrealizedPnl', 'tradeNetPnl', 'recordedDividendAmount']
      for (const key of decimals) {
        if (row[key] !== null) {
          expect(typeof row[key]).toBe('string')
          expect(row[key]).toMatch(/^-?\d+(\.\d{1,8})?$/)
        }
      }
      expect(new Prisma.Decimal(row.quantity).gte(0)).toBe(true)
      expect(Object.values(PortfolioAssetPerformanceStatus)).toContain(row.status)
      expect(Number.isInteger(row.recordedDividendCount)).toBe(true)
      expect(row.recordedDividendCount).toBeGreaterThanOrEqual(0)
      if (row.recordedDividendCount === 0) expect(row.recordedDividendAmount).toBeNull()
      else expect(row.recordedDividendAmount).not.toBeNull()
      for (const key of ['firstBuyAt', 'lastTradeAt', 'priceAsOf'] as const) {
        if (row[key] !== null) expect(new Date(row[key]).toISOString()).toBe(row[key])
      }
      expect(new Set(row.issues).size).toBe(row.issues.length)
      for (const issue of row.issues) expect(Object.values(PortfolioAssetPerformanceIssue)).toContain(issue)
      if (row.latestPrice === null) {
        expect(row.priceAsOf).toBeNull()
        expect(row.priceSource).toBeNull()
      }
      if (row.realizedNetPnl === null || row.unrealizedPnl === null) expect(row.tradeNetPnl).toBeNull()
      else expect(new Prisma.Decimal(row.realizedNetPnl).add(row.unrealizedPnl).eq(row.tradeNetPnl!)).toBe(true)
      if (row.unrealizedPnl !== null && row.latestPrice !== null && row.remainingCost !== null) {
        expect(new Prisma.Decimal(row.quantity).mul(row.latestPrice).sub(row.remainingCost).eq(row.unrealizedPnl)).toBe(true)
      }
    }
  })

  it('covers every issue, genuine zero, closed holdings without quotes, and same-asset currency separation', () => {
    const issues = new Set(Object.values(fixture.scenarios).flatMap(response => response.items.flatMap(row => row.issues)))
    expect([...issues].sort()).toEqual(Object.values(PortfolioAssetPerformanceIssue).sort())
    expect(fixture.scenarios.empty.items).toEqual([])
    expect(fixture.scenarios.zero_pnl.items[0].tradeNetPnl).toBe('0')
    expect(fixture.scenarios.closed_without_quote.items[0]).toMatchObject({ status: 'closed', quantity: '0', unrealizedPnl: '0', latestPrice: null, issues: [] })
    const currencies = fixture.scenarios.same_asset_different_currencies.items
    expect(currencies[0].assetId).toBe(currencies[1].assetId)
    expect(currencies.map(row => row.currency)).toEqual(['TWD', 'USD'])
    expect(fixture.scenarios.currency_mismatch.items[0]).toMatchObject({ latestPrice: null, tradeNetPnl: null, issues: ['CURRENCY_MISMATCH'] })
    expect(fixture.scenarios.missing_fifo.items[0]).toMatchObject({ realizedNetPnl: null, tradeNetPnl: null, issues: ['MISSING_FIFO'] })
    expect(fixture.scenarios.inconsistent_lots.items[0]).toMatchObject({ remainingCost: null, unrealizedPnl: null, tradeNetPnl: null })
  })
})
