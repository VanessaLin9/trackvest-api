import { Prisma } from '@prisma/client'
import { normalizeAssetCurrencyInput } from '../common/utils/asset-input.util'
import {
  AssetPerformanceSource,
  AssetPerformanceTransaction,
  formatPerformanceDecimal,
  summarizeSellFifo,
} from './asset-performance.calculator'
import {
  PortfolioAnnualRealizedIssue,
  PortfolioAnnualRealizedItemResponseDto,
  PortfolioAnnualRealizedResponseDto,
} from './dto/portfolio-annual-realized.response.dto'

/** Asia/Taipei has no DST. Year boundaries are UTC+8, not the host timezone. */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

export const ANNUAL_REALIZED_TIME_ZONE = 'Asia/Taipei'

export function taipeiYear(instant: Date): number {
  return new Date(instant.getTime() + TAIPEI_OFFSET_MS).getUTCFullYear()
}

/**
 * 年度已實現淨損益。歸屬看賣出的台北年份，成本沿用歷史 FIFO match，不限當年買進。
 * 缺 match 時保留淨收款，成本與淨損益為 null，不把不完整加總當成全年成果。
 */
export function buildAnnualRealized(
  source: AssetPerformanceSource,
  asOf: Date,
): PortfolioAnnualRealizedResponseDto {
  const currentYear = taipeiYear(asOf)
  const tradesByCurrency = groupTrades(source)
  const items: PortfolioAnnualRealizedItemResponseDto[] = []

  for (const [currency, trades] of tradesByCurrency) {
    const firstYear = earliestYear(trades)
    if (firstYear == null || firstYear > currentYear) continue
    for (let year = firstYear; year <= currentYear; year += 1) {
      const sells = trades.filter(trade => trade.type === 'sell' && taipeiYear(trade.tradeTime) === year)
      const summary = summarizeSellFifo(sells, source.matches)
      items.push({
        year,
        currency,
        sellCount: sells.length,
        netProceeds: formatPerformanceDecimal(summary.proceeds),
        disposedCost: summary.missingFifo ? null : formatPerformanceDecimal(summary.disposedCost),
        realizedNetPnl: summary.missingFifo
          ? null
          : formatPerformanceDecimal(summary.proceeds.sub(summary.disposedCost)),
        issues: summary.missingFifo ? [PortfolioAnnualRealizedIssue.MissingFifo] : [],
      })
    }
  }

  items.sort(compareAnnualRows)
  return {
    generatedAt: asOf.toISOString(),
    timeZone: ANNUAL_REALIZED_TIME_ZONE,
    items,
  }
}

function groupTrades(source: AssetPerformanceSource): Map<string, AssetPerformanceTransaction[]> {
  const currencyByAccount = new Map(
    source.accounts.map(account => [account.id, normalizeAssetCurrencyInput(account.currency)]),
  )
  const grouped = new Map<string, AssetPerformanceTransaction[]>()
  for (const transaction of source.transactions) {
    if (transaction.type === 'dividend') continue
    const currency = currencyByAccount.get(transaction.accountId)
    if (!currency) continue
    const existing = grouped.get(currency)
    if (existing) existing.push(transaction)
    else grouped.set(currency, [transaction])
  }
  return grouped
}

function earliestYear(trades: AssetPerformanceTransaction[]): number | null {
  const dated = trades.filter(trade => trade.type === 'buy' || trade.type === 'sell')
  if (dated.length === 0) return null
  return Math.min(...dated.map(trade => taipeiYear(trade.tradeTime)))
}

function compareAnnualRows(
  left: PortfolioAnnualRealizedItemResponseDto,
  right: PortfolioAnnualRealizedItemResponseDto,
): number {
  if (left.year !== right.year) return right.year - left.year
  if (left.currency !== right.currency) return left.currency < right.currency ? -1 : 1
  return 0
}

export function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value)
}
