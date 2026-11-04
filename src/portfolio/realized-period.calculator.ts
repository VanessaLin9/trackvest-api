import { Prisma } from '@prisma/client'
import { normalizeAssetCurrencyInput } from '../common/utils/asset-input.util'
import {
  AssetPerformanceMatch,
  AssetPerformanceTransaction,
  formatPerformanceDecimal,
  summarizeSellFifo,
} from './asset-performance.calculator'
import { PortfolioRealizedPeriodIssue } from './dto/realized-period.response.dto'
import type {
  PortfolioRealizedAssetItemDto,
  PortfolioRealizedAssetsResponseDto,
  PortfolioRealizedMoneySummaryDto,
  PortfolioRealizedMonthDto,
  PortfolioRealizedPeriodGroupDto,
  PortfolioRealizedPeriodsResponseDto,
  PortfolioRealizedTradeItemDto,
  PortfolioRealizedTradesResponseDto,
} from './dto/realized-period.response.dto'

/**
 * Asia/Taipei 無日光節約。年與月用 UTC+8，不用主機時區。
 * UTC 當月最後一天 16:00 是下一個台北月的起點；12/31 16:00 是下一年的 1 月（與 PR #49、#50 相同）。
 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

export const REALIZED_PERIOD_TIME_ZONE = 'Asia/Taipei'

/**
 * 績效頁的期間已實現損益。
 * 歸屬看賣出的台北年／月。成本用這筆 sell 的歷史 SellLotMatch，買進可以早於查詢期間，也不因尚未清倉而排除部分賣出。
 * 金額、股數與成本都以 Decimal 加總後才 ROUND_HALF_UP 到 8 位。各月或各列的顯示值再加總，可能與合計差在最後一位；對帳用未提前捨去的值，不另造調整交易。
 * tradeTime 晚於 generatedAt 的交易不納入，未來月份也不補 0。既有 annual-realized 仍會把當年未來交易算進該年，這支讀取不修改那個回應。
 * 缺 match 或匹配數量不完整時，該筆與所屬標的、月份、年度的成本與損益為 null，淨收款與筆數仍保留。其他完整的標的與月份照常顯示。
 */
export type RealizedPeriodAccount = {
  id: string
  name: string
  currency: string
}

export type RealizedPeriodTrade = AssetPerformanceTransaction & {
  price: Prisma.Decimal | null
  fee: Prisma.Decimal
  tax: Prisma.Decimal
}

export type RealizedPeriodAsset = {
  id: string
  symbol: string
  name: string
  type: string
}

export type RealizedPeriodSource = {
  accounts: RealizedPeriodAccount[]
  trades: RealizedPeriodTrade[]
  matches: AssetPerformanceMatch[]
  assets: RealizedPeriodAsset[]
}

export type RealizedPeriodQuery = {
  accountId: string | null
  year: number
  month: number | null
}

type SellFigure = {
  sell: RealizedPeriodTrade
  missingFifo: boolean
  proceeds: Prisma.Decimal
  disposedCost: Prisma.Decimal
  matchedQuantity: Prisma.Decimal
}

export class RealizedPeriodQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RealizedPeriodQueryError'
  }
}

export function assertRealizedPeriodAllowed(
  query: { year: number; month: number | null },
  asOf: Date,
): void {
  const current = taipeiParts(asOf)
  if (query.year > current.year) {
    throw new RealizedPeriodQueryError(
      'year is after the current Asia/Taipei year',
    )
  }
  if (
    query.month != null &&
    query.year === current.year &&
    query.month > current.month
  ) {
    throw new RealizedPeriodQueryError('month has not started in Asia/Taipei')
  }
}

export function buildRealizedPeriods(
  source: RealizedPeriodSource,
  query: { accountId: string | null; year: number },
  asOf: Date,
): PortfolioRealizedPeriodsResponseDto {
  assertRealizedPeriodAllowed({ year: query.year, month: null }, asOf)
  const current = taipeiParts(asOf)
  const matchesBySell = indexMatches(source.matches)
  const groups: PortfolioRealizedPeriodGroupDto[] = []

  for (const [currency, trades] of tradesByCurrency(source)) {
    const visible = trades.filter(trade => occurredBy(trade.tradeTime, asOf))
    const firstYear = earliestTradeYear(visible)
    if (firstYear == null || query.year < firstYear) continue

    const figures = figuresFor(
      visible.filter(
        trade =>
          trade.type === 'sell' &&
          taipeiParts(trade.tradeTime).year === query.year,
      ),
      matchesBySell,
    )
    const lastMonth = query.year === current.year ? current.month : 12
    const months: PortfolioRealizedMonthDto[] = []
    for (let month = 1; month <= lastMonth; month += 1) {
      const inMonth = figures.filter(
        figure => taipeiParts(figure.sell.tradeTime).month === month,
      )
      months.push({
        month,
        isCurrentMonth: query.year === current.year && month === current.month,
        ...aggregate(inMonth),
      })
    }
    groups.push({
      currency,
      summary: aggregate(figures),
      months,
    })
  }

  groups.sort((left, right) => compareText(left.currency, right.currency))
  return {
    generatedAt: asOf.toISOString(),
    timeZone: REALIZED_PERIOD_TIME_ZONE,
    scope: {
      accountId: query.accountId,
      year: query.year,
      month: null,
      currency: null,
    },
    periodStart: taipeiPeriodStart(query.year, null).toISOString(),
    periodEndExclusive: taipeiPeriodEndExclusive(
      query.year,
      null,
    ).toISOString(),
    asOf: openAsOf(asOf, query.year, null),
    isCurrentYear: query.year === current.year,
    groups,
  }
}

export function buildRealizedAssets(
  source: RealizedPeriodSource,
  query: RealizedPeriodQuery & { currency: string; skip: number; take: number },
  asOf: Date,
): PortfolioRealizedAssetsResponseDto {
  assertRealizedPeriodAllowed(query, asOf)
  const currency = normalizeAssetCurrencyInput(query.currency)
  const figures = figuresInPeriod(source, currency, query, asOf)
  const assetsById = new Map(source.assets.map(asset => [asset.id, asset]))
  const byAsset = new Map<string, SellFigure[]>()
  for (const figure of figures) {
    const existing = byAsset.get(figure.sell.assetId)
    if (existing) existing.push(figure)
    else byAsset.set(figure.sell.assetId, [figure])
  }

  const rows: PortfolioRealizedAssetItemDto[] = [...byAsset.entries()].map(
    ([assetId, assetFigures]) => {
      const asset = assetsById.get(assetId)
      if (!asset)
        throw new Error(`Asset metadata missing for realized row ${assetId}`)
      const missing = assetFigures.some(figure => figure.missingFifo)
      const proceeds = sumDecimals(assetFigures.map(figure => figure.proceeds))
      const cost = sumDecimals(assetFigures.map(figure => figure.disposedCost))
      return {
        assetId,
        symbol: asset.symbol,
        name: asset.name,
        type: asset.type,
        sellCount: assetFigures.length,
        realizedQuantity: missing
          ? null
          : formatPerformanceDecimal(
              sumDecimals(assetFigures.map(figure => figure.matchedQuantity)),
            ),
        netProceeds: formatPerformanceDecimal(proceeds),
        disposedCost: missing ? null : formatPerformanceDecimal(cost),
        realizedNetPnl: missing
          ? null
          : formatPerformanceDecimal(proceeds.sub(cost)),
        issues: missing ? [PortfolioRealizedPeriodIssue.MissingFifo] : [],
      }
    },
  )
  rows.sort(
    (left, right) =>
      compareText(left.symbol, right.symbol) ||
      compareText(left.assetId, right.assetId),
  )

  return {
    ...periodEnvelope(query, currency, asOf),
    summary: aggregate(figures),
    items: rows.slice(query.skip, query.skip + query.take),
    total: rows.length,
    skip: query.skip,
    take: query.take,
  }
}

export function buildRealizedTrades(
  source: RealizedPeriodSource,
  query: RealizedPeriodQuery & {
    currency: string
    assetId: string
    skip: number
    take: number
  },
  asOf: Date,
): PortfolioRealizedTradesResponseDto {
  assertRealizedPeriodAllowed(query, asOf)
  const currency = normalizeAssetCurrencyInput(query.currency)
  const figures = figuresInPeriod(source, currency, query, asOf)
    .filter(figure => figure.sell.assetId === query.assetId)
    .sort((left, right) => {
      const time =
        right.sell.tradeTime.getTime() - left.sell.tradeTime.getTime()
      if (time !== 0) return time
      return compareText(left.sell.id, right.sell.id)
    })
  const accounts = new Map(
    source.accounts.map(account => [account.id, account]),
  )
  const assets = new Map(source.assets.map(asset => [asset.id, asset]))
  const items: PortfolioRealizedTradeItemDto[] = figures
    .slice(query.skip, query.skip + query.take)
    .map(figure => {
      const account = accounts.get(figure.sell.accountId)
      const asset = assets.get(figure.sell.assetId)
      if (!account || !asset) {
        throw new Error(
          `Realized sell ${figure.sell.id} is missing account or asset metadata`,
        )
      }
      return {
        transactionId: figure.sell.id,
        accountId: figure.sell.accountId,
        accountName: account.name,
        assetId: figure.sell.assetId,
        symbol: asset.symbol,
        name: asset.name,
        tradeTime: figure.sell.tradeTime.toISOString(),
        type: 'sell',
        quantity:
          figure.sell.quantity == null
            ? null
            : formatPerformanceDecimal(figure.sell.quantity),
        price:
          figure.sell.price == null
            ? null
            : formatPerformanceDecimal(figure.sell.price),
        amount: formatPerformanceDecimal(figure.proceeds),
        fee: formatPerformanceDecimal(figure.sell.fee),
        tax: formatPerformanceDecimal(figure.sell.tax),
        disposedCost: figure.missingFifo
          ? null
          : formatPerformanceDecimal(figure.disposedCost),
        realizedNetPnl: figure.missingFifo
          ? null
          : formatPerformanceDecimal(figure.proceeds.sub(figure.disposedCost)),
        issues: figure.missingFifo
          ? [PortfolioRealizedPeriodIssue.MissingFifo]
          : [],
      }
    })

  return {
    ...periodEnvelope(query, currency, asOf),
    scope: {
      accountId: query.accountId,
      year: query.year,
      month: query.month,
      currency,
      assetId: query.assetId,
    },
    summary: aggregate(figures),
    items,
    total: figures.length,
    skip: query.skip,
    take: query.take,
  }
}

function periodEnvelope(
  query: RealizedPeriodQuery,
  currency: string,
  asOf: Date,
): Pick<
  PortfolioRealizedAssetsResponseDto,
  | 'generatedAt'
  | 'timeZone'
  | 'scope'
  | 'periodStart'
  | 'periodEndExclusive'
  | 'asOf'
> {
  return {
    generatedAt: asOf.toISOString(),
    timeZone: REALIZED_PERIOD_TIME_ZONE,
    scope: {
      accountId: query.accountId,
      year: query.year,
      month: query.month,
      currency,
    },
    periodStart: taipeiPeriodStart(query.year, query.month).toISOString(),
    periodEndExclusive: taipeiPeriodEndExclusive(
      query.year,
      query.month,
    ).toISOString(),
    asOf: openAsOf(asOf, query.year, query.month),
  }
}

function figuresInPeriod(
  source: RealizedPeriodSource,
  currency: string,
  query: RealizedPeriodQuery,
  asOf: Date,
): SellFigure[] {
  const trades = tradesByCurrency(source).get(currency) ?? []
  const sells = trades.filter(
    trade =>
      trade.type === 'sell' &&
      occurredBy(trade.tradeTime, asOf) &&
      inCalendarPeriod(trade.tradeTime, query.year, query.month),
  )
  return figuresFor(sells, indexMatches(source.matches))
}

function figuresFor(
  sells: RealizedPeriodTrade[],
  matchesBySell: Map<string, AssetPerformanceMatch[]>,
): SellFigure[] {
  return sells.map(sell => {
    const matches = matchesBySell.get(sell.id) ?? []
    const summary = summarizeSellFifo([sell], matches)
    return {
      sell,
      missingFifo: summary.missingFifo,
      proceeds: summary.proceeds,
      disposedCost: summary.disposedCost,
      matchedQuantity: sumDecimals(matches.map(match => match.quantity)),
    }
  })
}

function aggregate(figures: SellFigure[]): PortfolioRealizedMoneySummaryDto {
  if (figures.length === 0) {
    return {
      sellCount: 0,
      netProceeds: '0',
      disposedCost: '0',
      realizedNetPnl: '0',
      issues: [],
    }
  }
  const missing = figures.some(figure => figure.missingFifo)
  const proceeds = sumDecimals(figures.map(figure => figure.proceeds))
  const cost = sumDecimals(figures.map(figure => figure.disposedCost))
  return {
    sellCount: figures.length,
    netProceeds: formatPerformanceDecimal(proceeds),
    disposedCost: missing ? null : formatPerformanceDecimal(cost),
    realizedNetPnl: missing
      ? null
      : formatPerformanceDecimal(proceeds.sub(cost)),
    issues: missing ? [PortfolioRealizedPeriodIssue.MissingFifo] : [],
  }
}

function tradesByCurrency(
  source: RealizedPeriodSource,
): Map<string, RealizedPeriodTrade[]> {
  const currencyByAccount = new Map(
    source.accounts.map(account => [
      account.id,
      normalizeAssetCurrencyInput(account.currency),
    ]),
  )
  const grouped = new Map<string, RealizedPeriodTrade[]>()
  for (const trade of source.trades) {
    if (trade.type === 'dividend') continue
    const currency = currencyByAccount.get(trade.accountId)
    if (!currency) continue
    const existing = grouped.get(currency)
    if (existing) existing.push(trade)
    else grouped.set(currency, [trade])
  }
  return grouped
}

function earliestTradeYear(trades: RealizedPeriodTrade[]): number | null {
  const dated = trades.filter(
    trade => trade.type === 'buy' || trade.type === 'sell',
  )
  if (dated.length === 0) return null
  return Math.min(...dated.map(trade => taipeiParts(trade.tradeTime).year))
}

function indexMatches(
  matches: AssetPerformanceMatch[],
): Map<string, AssetPerformanceMatch[]> {
  const grouped = new Map<string, AssetPerformanceMatch[]>()
  for (const match of matches) {
    const existing = grouped.get(match.sellTransactionId)
    if (existing) existing.push(match)
    else grouped.set(match.sellTransactionId, [match])
  }
  return grouped
}

function inCalendarPeriod(
  instant: Date,
  year: number,
  month: number | null,
): boolean {
  const parts = taipeiParts(instant)
  if (parts.year !== year) return false
  return month == null || parts.month === month
}

function occurredBy(instant: Date, asOf: Date): boolean {
  return instant.getTime() <= asOf.getTime()
}

function openAsOf(
  asOf: Date,
  year: number,
  month: number | null,
): string | null {
  const current = taipeiParts(asOf)
  const open =
    month == null
      ? year === current.year
      : year === current.year && month === current.month
  return open ? asOf.toISOString() : null
}

function taipeiParts(instant: Date): { year: number; month: number } {
  const shifted = new Date(instant.getTime() + TAIPEI_OFFSET_MS)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 }
}

export function taipeiPeriodStart(year: number, month: number | null): Date {
  const startMonth = month ?? 1
  return new Date(Date.UTC(year, startMonth - 1, 1) - TAIPEI_OFFSET_MS)
}

export function taipeiPeriodEndExclusive(
  year: number,
  month: number | null,
): Date {
  if (month == null)
    return new Date(Date.UTC(year + 1, 0, 1) - TAIPEI_OFFSET_MS)
  return new Date(Date.UTC(year, month, 1) - TAIPEI_OFFSET_MS)
}

function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce(
    (total, value) => total.add(value),
    new Prisma.Decimal(0),
  )
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}
