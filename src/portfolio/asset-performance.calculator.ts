import { Prisma } from '@prisma/client'
import { normalizeAssetCurrencyInput } from '../common/utils/asset-input.util'
import {
  PortfolioAssetPerformanceIssue,
  PortfolioAssetPerformanceItemResponseDto,
  PortfolioAssetPerformanceResponseDto,
  PortfolioAssetPerformanceStatus,
} from './dto/portfolio-asset-performance.response.dto'

/**
 * 各標的歷史成果的純計算（PR #48）。
 * 已實現淨損益用賣出 amount（淨收款）減 SellLotMatch 成本，不讀 GL realized 科目：
 * sell posting 把費稅另列 expense，直接加總該科目會得到不同口徑。
 * 呼叫端須先排除軟刪，並傳入已重算過的 lot／match；這裡不再套用分割比例。
 */
export type AssetPerformanceTransaction = {
  id: string
  accountId: string
  assetId: string
  type: 'buy' | 'sell' | 'dividend'
  amount: Prisma.Decimal
  quantity: Prisma.Decimal | null
  tradeTime: Date
}

export type AssetPerformanceLot = {
  accountId: string
  assetId: string
  remainingQuantity: Prisma.Decimal
  unitCost: Prisma.Decimal
}

export type AssetPerformancePosition = {
  accountId: string
  assetId: string
  quantity: Prisma.Decimal
}

export type AssetPerformanceMatch = {
  sellTransactionId: string
  quantity: Prisma.Decimal
  unitCost: Prisma.Decimal
}

export type AssetPerformanceAsset = {
  id: string
  symbol: string
  name: string
  baseCurrency: string
}

export type AssetPerformanceQuote = {
  assetId: string
  price: Prisma.Decimal
  asOf: Date
  source: string
}

export type AssetPerformanceSource = {
  accounts: Array<{ id: string; currency: string }>
  transactions: AssetPerformanceTransaction[]
  lots: AssetPerformanceLot[]
  positions: AssetPerformancePosition[]
  matches: AssetPerformanceMatch[]
  assets: AssetPerformanceAsset[]
  quotes: AssetPerformanceQuote[]
}

const ISSUE_ORDER = [
  PortfolioAssetPerformanceIssue.MissingFifo,
  PortfolioAssetPerformanceIssue.MissingPrice,
  PortfolioAssetPerformanceIssue.CurrencyMismatch,
  PortfolioAssetPerformanceIssue.InconsistentLots,
] as const

const OUTPUT_SCALE = 8

type Group = {
  assetId: string
  currency: string
  buys: AssetPerformanceTransaction[]
  sells: AssetPerformanceTransaction[]
  dividends: AssetPerformanceTransaction[]
  lots: AssetPerformanceLot[]
  positions: AssetPerformancePosition[]
}

export function buildAssetPerformance(
  source: AssetPerformanceSource,
  generatedAt: Date,
): PortfolioAssetPerformanceResponseDto {
  const items = [...groupRows(source).values()]
    .map(group => buildRow(group, source))
    .sort(compareRows)

  return {
    generatedAt: generatedAt.toISOString(),
    items,
  }
}

function groupRows(source: AssetPerformanceSource): Map<string, Group> {
  const currencyByAccount = new Map(
    source.accounts.map(account => [account.id, normalizeAssetCurrencyInput(account.currency)]),
  )
  const groups = new Map<string, Group>()
  const dividends: AssetPerformanceTransaction[] = []

  for (const transaction of source.transactions) {
    const currency = currencyByAccount.get(transaction.accountId)
    if (!currency) continue
    if (transaction.type === 'dividend') {
      dividends.push(transaction)
      continue
    }
    const group = ensureGroup(groups, transaction.assetId, currency)
    if (transaction.type === 'buy') group.buys.push(transaction)
    else group.sells.push(transaction)
  }

  for (const transaction of dividends) {
    const currency = currencyByAccount.get(transaction.accountId)
    if (!currency) continue
    groups.get(keyOf(transaction.assetId, currency))?.dividends.push(transaction)
  }

  for (const lot of source.lots) {
    const currency = currencyByAccount.get(lot.accountId)
    if (!currency) continue
    groups.get(keyOf(lot.assetId, currency))?.lots.push(lot)
  }

  for (const position of source.positions) {
    const currency = currencyByAccount.get(position.accountId)
    if (!currency) continue
    groups.get(keyOf(position.assetId, currency))?.positions.push(position)
  }

  return groups
}

function buildRow(group: Group, source: AssetPerformanceSource): PortfolioAssetPerformanceItemResponseDto {
  const asset = source.assets.find(candidate => candidate.id === group.assetId)
  if (!asset) {
    throw new Error(`Asset metadata missing for performance row ${group.assetId}`)
  }

  const matchesBySell = matchesFor(group, source.matches)
  const missingFifo = hasMissingFifo(group, matchesBySell)
  // 同一原幣列可能含多個帳戶；任一帳戶對不上就整列不作成本與已實現（PR #48）。
  const inconsistentLots = hasInconsistentLots(group)
  const quantity = sumDecimals(group.lots.map(lot => lot.remainingQuantity))
  const remainingCost = inconsistentLots
    ? null
    : sumDecimals(group.lots.map(lot => lot.remainingQuantity.mul(lot.unitCost)))
  const realized = resolveRealized(group, matchesBySell, missingFifo, inconsistentLots)
  const realizedQuantity = resolveRealizedQuantity(group, matchesBySell, missingFifo)
  const quote = latestUsableQuote(source.quotes, group.assetId)
  const quoteCurrencyDiffers = quote != null
    && normalizeAssetCurrencyInput(asset.baseCurrency) !== normalizeAssetCurrencyInput(group.currency)
  const needsQuote = quantity.gt(0)
  const issues: PortfolioAssetPerformanceIssue[] = []

  if (missingFifo) issues.push(PortfolioAssetPerformanceIssue.MissingFifo)
  // 沒有可用報價才是 MISSING_PRICE。幣別不符是把外幣報價拿掉，不另標缺價格（PR #48）。
  if (needsQuote && quote == null) issues.push(PortfolioAssetPerformanceIssue.MissingPrice)
  if (needsQuote && quoteCurrencyDiffers) issues.push(PortfolioAssetPerformanceIssue.CurrencyMismatch)
  if (inconsistentLots) issues.push(PortfolioAssetPerformanceIssue.InconsistentLots)

  const showQuote = quote != null && !quoteCurrencyDiffers
  const unrealized = resolveUnrealized({
    inconsistentLots,
    needsQuote,
    quoteCurrencyDiffers,
    quantity,
    remainingCost,
    quote,
  })
  const tradeNet = realized != null && unrealized != null ? realized.add(unrealized) : null

  return {
    assetId: group.assetId,
    symbol: asset.symbol,
    name: asset.name,
    currency: normalizeAssetCurrencyInput(group.currency),
    status: quantity.gt(0)
      ? PortfolioAssetPerformanceStatus.Holding
      : PortfolioAssetPerformanceStatus.Closed,
    quantity: formatDecimal(quantity),
    realizedQuantity: realizedQuantity == null ? null : formatDecimal(realizedQuantity),
    realizedNetPnl: realized == null ? null : formatDecimal(realized),
    remainingCost: remainingCost == null ? null : formatDecimal(remainingCost),
    latestPrice: showQuote ? formatDecimal(quote.price) : null,
    priceAsOf: showQuote ? quote.asOf.toISOString() : null,
    priceSource: showQuote ? quote.source : null,
    unrealizedPnl: unrealized == null ? null : formatDecimal(unrealized),
    tradeNetPnl: tradeNet == null ? null : formatDecimal(tradeNet),
    recordedDividendAmount: group.dividends.length === 0
      ? null
      : formatDecimal(sumDecimals(group.dividends.map(dividend => dividend.amount))),
    recordedDividendCount: group.dividends.length,
    firstBuyAt: earliest(group.buys.map(buy => buy.tradeTime)),
    lastTradeAt: latest(rowsWithTime(group)),
    issues: ISSUE_ORDER.filter(issue => issues.includes(issue)),
  }
}

function resolveRealizedQuantity(
  group: Group,
  matchesBySell: Map<string, AssetPerformanceMatch[]>,
  missingFifo: boolean,
): Prisma.Decimal | null {
  // 已實現股數是完成 FIFO match 的賣出股數加總，不是剩餘股數，也不是其中賺錢的那幾股。
  // 沒有賣出是 0。match 缺漏或數量不符時整列為 null，不可把對上一半的股數當成總賣出。
  // lot 與 position 不一致不拿掉已對上的股數。分割後直接加已重算的 match（PR #48）。
  if (missingFifo) return null
  if (group.sells.length === 0) return new Prisma.Decimal(0)
  return sumDecimals(
    group.sells.flatMap(sell => (matchesBySell.get(sell.id) ?? []).map(match => match.quantity)),
  )
}

function resolveRealized(
  group: Group,
  matchesBySell: Map<string, AssetPerformanceMatch[]>,
  missingFifo: boolean,
  inconsistentLots: boolean,
): Prisma.Decimal | null {
  // lot 與 position 不一致，或賣出 match 對不上時，已實現無法確認，不可當 0（PR #48）。
  if (missingFifo || inconsistentLots) return null
  if (group.sells.length === 0) return new Prisma.Decimal(0)

  const proceeds = sumDecimals(group.sells.map(sell => sell.amount))
  const disposedCost = sumDecimals(
    group.sells.flatMap(sell =>
      (matchesBySell.get(sell.id) ?? []).map(match => match.quantity.mul(match.unitCost)),
    ),
  )
  return proceeds.sub(disposedCost)
}

function resolveUnrealized(input: {
  inconsistentLots: boolean
  needsQuote: boolean
  quoteCurrencyDiffers: boolean
  quantity: Prisma.Decimal
  remainingCost: Prisma.Decimal | null
  quote: AssetPerformanceQuote | null
}): Prisma.Decimal | null {
  if (input.inconsistentLots || input.remainingCost == null) return null
  // 已清倉且 lot／position 一致時，未實現就是 0，不因缺行情標成缺資料（PR #48）。
  if (!input.needsQuote) return new Prisma.Decimal(0)
  if (input.quoteCurrencyDiffers || input.quote == null) return null
  return input.quantity.mul(input.quote.price).sub(input.remainingCost)
}

function hasMissingFifo(
  group: Group,
  matchesBySell: Map<string, AssetPerformanceMatch[]>,
): boolean {
  return group.sells.some(sell => {
    if (sell.quantity == null) return true
    const matched = sumDecimals((matchesBySell.get(sell.id) ?? []).map(match => match.quantity))
    return !matched.eq(sell.quantity)
  })
}

function hasInconsistentLots(group: Group): boolean {
  const accountIds = new Set<string>([
    ...group.buys.map(buy => buy.accountId),
    ...group.sells.map(sell => sell.accountId),
    ...group.lots.map(lot => lot.accountId),
    ...group.positions.map(position => position.accountId),
  ])

  for (const accountId of accountIds) {
    const lots = group.lots.filter(lot => lot.accountId === accountId)
    const positions = group.positions.filter(position => position.accountId === accountId)
    const hasTrade = group.buys.some(buy => buy.accountId === accountId)
      || group.sells.some(sell => sell.accountId === accountId)
    if (hasTrade && lots.length === 0) return true
    if (lots.some(lot => lot.remainingQuantity.isNeg()) || positions.some(position => position.quantity.isNeg())) {
      return true
    }
    const lotQuantity = sumDecimals(lots.map(lot => lot.remainingQuantity))
    const positionQuantity = sumDecimals(positions.map(position => position.quantity))
    // 增量買進把股數加成 JavaScript 數字。0.1 + 0.2 會寫成 0.30000000000000004，
    // lot 加總仍是 0.3。收到輸出的 8 位小數後相同，就不把損益整列清空。
    // 8 位以內仍有差距才是 INCONSISTENT_LOTS（PR #48）。
    if (!sameOutputQuantity(lotQuantity, positionQuantity)) return true
  }

  return false
}

function isUsableMarketQuote(quote: AssetPerformanceQuote, assetId: string): boolean {
  return quote.assetId === assetId
    && quote.source !== 'seed'
    && quote.price.isFinite()
    && quote.price.gt(0)
}

function latestUsableQuote(
  quotes: AssetPerformanceQuote[],
  assetId: string,
): AssetPerformanceQuote | null {
  let selected: AssetPerformanceQuote | null = null
  for (const quote of quotes) {
    // source=seed 不是市場估值；較舊的非 seed 報價仍可附上它自己的時間（PR #48）。
    // 非正數或非有限報價也不是有效估值。先排除再挑最新日期；全無有效價才是 MISSING_PRICE（PR #48）。
    if (!isUsableMarketQuote(quote, assetId)) continue
    if (
      selected == null
      || quote.asOf.getTime() > selected.asOf.getTime()
      || (quote.asOf.getTime() === selected.asOf.getTime() && quote.source < selected.source)
    ) {
      selected = quote
    }
  }
  return selected
}

function matchesFor(
  group: Group,
  matches: AssetPerformanceMatch[],
): Map<string, AssetPerformanceMatch[]> {
  const sellIds = new Set(group.sells.map(sell => sell.id))
  const grouped = new Map<string, AssetPerformanceMatch[]>()
  for (const match of matches) {
    if (!sellIds.has(match.sellTransactionId)) continue
    const existing = grouped.get(match.sellTransactionId)
    if (existing) existing.push(match)
    else grouped.set(match.sellTransactionId, [match])
  }
  return grouped
}

function ensureGroup(groups: Map<string, Group>, assetId: string, currency: string): Group {
  const key = keyOf(assetId, currency)
  const existing = groups.get(key)
  if (existing) return existing
  const created: Group = {
    assetId,
    currency,
    buys: [],
    sells: [],
    dividends: [],
    lots: [],
    positions: [],
  }
  groups.set(key, created)
  return created
}

function keyOf(assetId: string, currency: string): string {
  return `${assetId}\0${currency}`
}

function rowsWithTime(group: Group): Date[] {
  return [...group.buys, ...group.sells].map(transaction => transaction.tradeTime)
}

function earliest(values: Date[]): string | null {
  if (values.length === 0) return null
  return new Date(Math.min(...values.map(value => value.getTime()))).toISOString()
}

function latest(values: Date[]): string {
  return new Date(Math.max(...values.map(value => value.getTime()))).toISOString()
}

function sameOutputQuantity(left: Prisma.Decimal, right: Prisma.Decimal): boolean {
  const scale = (value: Prisma.Decimal) => value.toDecimalPlaces(OUTPUT_SCALE, Prisma.Decimal.ROUND_HALF_UP)
  return scale(left).eq(scale(right))
}

function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.add(value), new Prisma.Decimal(0))
}

function formatDecimal(value: Prisma.Decimal): string {
  const fixed = value.toDecimalPlaces(OUTPUT_SCALE, Prisma.Decimal.ROUND_HALF_UP).toFixed(OUTPUT_SCALE)
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '-0' ? '0' : trimmed
}

function compareRows(
  left: PortfolioAssetPerformanceItemResponseDto,
  right: PortfolioAssetPerformanceItemResponseDto,
): number {
  if (left.symbol !== right.symbol) return left.symbol < right.symbol ? -1 : 1
  if (left.currency !== right.currency) return left.currency < right.currency ? -1 : 1
  if (left.assetId !== right.assetId) return left.assetId < right.assetId ? -1 : 1
  return 0
}
