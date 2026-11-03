import { AssetType, Prisma } from '@prisma/client'
import { normalizeAssetCurrencyInput } from '../common/utils/asset-input.util'
import {
  PortfolioAnnualBuyAssetType,
  PortfolioAnnualBuyItemResponseDto,
  PortfolioAnnualBuyMonthResponseDto,
  PortfolioAnnualBuyTypeResponseDto,
  PortfolioAnnualBuysResponseDto,
} from './dto/portfolio-annual-buys.response.dto'

/** Asia/Taipei 無日光節約。年與月用 UTC+8，不用主機時區；UTC 12/31 16:00 算下一個台北年。 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const OUTPUT_SCALE = 8

const TYPE_ORDER: PortfolioAnnualBuyAssetType[] = [
  PortfolioAnnualBuyAssetType.Equity,
  PortfolioAnnualBuyAssetType.Etf,
  PortfolioAnnualBuyAssetType.Crypto,
  PortfolioAnnualBuyAssetType.Cash,
  PortfolioAnnualBuyAssetType.Other,
]

export const ANNUAL_BUYS_TIME_ZONE = 'Asia/Taipei'

export type AnnualBuyTrade = {
  accountId: string
  assetId: string
  type: 'buy' | 'sell' | 'dividend'
  amount: Prisma.Decimal
  tradeTime: Date
}

export type AnnualBuySource = {
  accounts: Array<{ id: string; currency: string }>
  trades: AnnualBuyTrade[]
  assets: Array<{ id: string; type: AssetType | null }>
}

/**
 * 年度買進金額與類型配置。買進用 buy.amount（費用已在金額內），賣出淨收款另列。
 * 類型看 Asset.type，不用 assetClass，所以股票型 ETF 仍是 etf。
 * 沒有買進時不產出 0% 占比。當年只列到查詢當下的台北月，之後的月份不補 0。
 */
export function buildAnnualBuys(source: AnnualBuySource, asOf: Date): PortfolioAnnualBuysResponseDto {
  const asOfParts = taipeiParts(asOf)
  const typeByAsset = new Map(source.assets.map(asset => [asset.id, classifyAssetType(asset.type)]))
  const tradesByCurrency = groupTrades(source)
  const items: PortfolioAnnualBuyItemResponseDto[] = []

  for (const [currency, trades] of tradesByCurrency) {
    const firstYear = earliestYear(trades)
    if (firstYear == null || firstYear > asOfParts.year) continue
    for (let year = firstYear; year <= asOfParts.year; year += 1) {
      items.push(buildYear(currency, year, trades, typeByAsset, year === asOfParts.year ? asOfParts.month : 12))
    }
  }

  items.sort(compareRows)
  return {
    generatedAt: asOf.toISOString(),
    timeZone: ANNUAL_BUYS_TIME_ZONE,
    items,
  }
}

export function taipeiParts(instant: Date): { year: number; month: number } {
  const shifted = new Date(instant.getTime() + TAIPEI_OFFSET_MS)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 }
}

function buildYear(
  currency: string,
  year: number,
  trades: AnnualBuyTrade[],
  typeByAsset: Map<string, PortfolioAnnualBuyAssetType>,
  lastMonth: number,
): PortfolioAnnualBuyItemResponseDto {
  const yearTrades = trades.filter(trade => taipeiParts(trade.tradeTime).year === year)
  const buys = yearTrades.filter(trade => trade.type === 'buy')
  const sells = yearTrades.filter(trade => trade.type === 'sell')
  const buyTotal = sumDecimals(buys.map(trade => trade.amount))
  const sellTotal = sumDecimals(sells.map(trade => trade.amount))
  const months: PortfolioAnnualBuyMonthResponseDto[] = []
  for (let month = 1; month <= lastMonth; month += 1) {
    const monthBuys = buys.filter(trade => taipeiParts(trade.tradeTime).month === month)
    months.push(buildMonth(month, monthBuys, typeByAsset))
  }
  return {
    year,
    currency,
    buyCount: buys.length,
    buyAmount: formatDecimal(buyTotal),
    sellCount: sells.length,
    sellNetProceeds: formatDecimal(sellTotal),
    buyMinusSellProceeds: formatDecimal(buyTotal.sub(sellTotal)),
    types: buildTypeRows(bucketBuys(buys, typeByAsset), buyTotal),
    months,
  }
}

function buildMonth(
  month: number,
  buys: AnnualBuyTrade[],
  typeByAsset: Map<string, PortfolioAnnualBuyAssetType>,
): PortfolioAnnualBuyMonthResponseDto {
  const total = sumDecimals(buys.map(trade => trade.amount))
  return {
    month,
    buyAmount: formatDecimal(total),
    types: buildTypeRows(bucketBuys(buys, typeByAsset), total),
  }
}

function bucketBuys(
  buys: AnnualBuyTrade[],
  typeByAsset: Map<string, PortfolioAnnualBuyAssetType>,
): Map<PortfolioAnnualBuyAssetType, Prisma.Decimal> {
  const byType = new Map<PortfolioAnnualBuyAssetType, Prisma.Decimal>()
  for (const buy of buys) {
    const type = typeByAsset.get(buy.assetId) ?? PortfolioAnnualBuyAssetType.Other
    byType.set(type, (byType.get(type) ?? new Prisma.Decimal(0)).add(buy.amount))
  }
  return byType
}

function buildTypeRows(
  byType: Map<PortfolioAnnualBuyAssetType, Prisma.Decimal>,
  total: Prisma.Decimal,
): PortfolioAnnualBuyTypeResponseDto[] {
  return TYPE_ORDER.flatMap(type => {
    const amount = byType.get(type)
    if (amount == null || amount.isZero()) return []
    return [{
      type,
      buyAmount: formatDecimal(amount),
      share: total.isZero() ? null : formatDecimal(amount.div(total)),
    }]
  })
}

function groupTrades(source: AnnualBuySource): Map<string, AnnualBuyTrade[]> {
  const currencyByAccount = new Map(
    source.accounts.map(account => [account.id, normalizeAssetCurrencyInput(account.currency)]),
  )
  const grouped = new Map<string, AnnualBuyTrade[]>()
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

function earliestYear(trades: AnnualBuyTrade[]): number | null {
  const dated = trades.filter(trade => trade.type === 'buy' || trade.type === 'sell')
  if (dated.length === 0) return null
  return Math.min(...dated.map(trade => taipeiParts(trade.tradeTime).year))
}

function classifyAssetType(type: AssetType | null): PortfolioAnnualBuyAssetType {
  if (type === AssetType.equity) return PortfolioAnnualBuyAssetType.Equity
  if (type === AssetType.etf) return PortfolioAnnualBuyAssetType.Etf
  if (type === AssetType.crypto) return PortfolioAnnualBuyAssetType.Crypto
  if (type === AssetType.cash) return PortfolioAnnualBuyAssetType.Cash
  return PortfolioAnnualBuyAssetType.Other
}

function compareRows(left: PortfolioAnnualBuyItemResponseDto, right: PortfolioAnnualBuyItemResponseDto): number {
  if (left.year !== right.year) return right.year - left.year
  if (left.currency !== right.currency) return left.currency < right.currency ? -1 : 1
  return 0
}

function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.add(value), new Prisma.Decimal(0))
}

function formatDecimal(value: Prisma.Decimal): string {
  const fixed = value.toDecimalPlaces(OUTPUT_SCALE, Prisma.Decimal.ROUND_HALF_UP).toFixed(OUTPUT_SCALE)
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '-0' ? '0' : trimmed
}
