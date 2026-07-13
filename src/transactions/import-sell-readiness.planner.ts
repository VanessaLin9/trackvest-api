import { toNumber } from '../common/utils/number.util'
import {
  ImportSellReadinessPlan,
  PlanImportSellReadinessInput,
  PlannerHistoryTransaction,
  PlannerImportCandidate,
  PlannerScopeEntry,
  PlannerScopePlan,
  PlannerTradeSide,
  SellReadinessBlockReason,
  SELL_READINESS_BLOCK_REASONS,
} from './import-sell-readiness.planner.types'

const QTY_EPS = 1e-9

type ScopeKey = string

type Lot = {
  remainingQuantity: number
  openCalendarDate: string
}

type DayTrade =
  | {
      kind: 'history'
      type: PlannerTradeSide
      tradeCalendarDate: string
      quantity: number
      id: string
    }
  | {
      kind: 'import'
      type: PlannerTradeSide
      tradeCalendarDate: string
      quantity: number
      rowNumber: number
    }

/**
 * Side-effect-free chronological sell-readiness planner.
 * Groups by (accountId, assetId), evaluates sells against earlier-date holdings
 * only, and never lets same-calendar-day buys fund same-day sells.
 */
export function planImportSellReadiness(
  input: PlanImportSellReadinessInput,
): ImportSellReadinessPlan {
  const scopeKeys = collectScopeKeys(input.history, input.candidates)
  const scopes: PlannerScopePlan[] = []

  for (const key of scopeKeys) {
    const [accountId, assetId] = splitScopeKey(key)
    scopes.push(
      planSingleScope({
        accountId,
        assetId,
        history: input.history.filter(
          (tx) => tx.accountId === accountId && tx.assetId === assetId,
        ),
        candidates: input.candidates.filter(
          (row) => row.accountId === accountId && row.assetId === assetId,
        ),
      }),
    )
  }

  scopes.sort((a, b) => {
    const accountCmp = a.accountId.localeCompare(b.accountId)
    if (accountCmp !== 0) {
      return accountCmp
    }
    return a.assetId.localeCompare(b.assetId)
  })

  return {
    scopes,
    writeOrderRowNumbers: scopes.flatMap((scope) => scope.writeOrderRowNumbers),
  }
}

function planSingleScope(params: {
  accountId: string
  assetId: string
  history: PlannerHistoryTransaction[]
  candidates: PlannerImportCandidate[]
}): PlannerScopePlan {
  const { accountId, assetId, history, candidates } = params
  const lots: Lot[] = []
  const entries: PlannerScopeEntry[] = []
  const dayTrades = buildDayTrades(history, candidates)
  const calendarDates = [...new Set(dayTrades.map((trade) => trade.tradeCalendarDate))].sort()

  for (const calendarDate of calendarDates) {
    const tradesOnDay = dayTrades.filter((trade) => trade.tradeCalendarDate === calendarDate)
    const buysOnDay = tradesOnDay.filter((trade) => trade.type === 'buy')
    const sellsOnDay = tradesOnDay.filter((trade) => trade.type === 'sell')
    const sameDayBuyQuantity = sumQuantity(buysOnDay)

    for (const sell of sortSellsForDay(sellsOnDay)) {
      const quantity = toNumber(sell.quantity)
      const priorAvailable = sumLotsOpenedBefore(lots, calendarDate)

      if (quantity <= priorAvailable + QTY_EPS) {
        consumeLotsOpenedBefore(lots, calendarDate, quantity)
        if (sell.kind === 'import') {
          entries.push({
            rowNumber: sell.rowNumber,
            accountId,
            assetId,
            type: 'sell',
            tradeCalendarDate: calendarDate,
            status: 'ready',
          })
        }
        continue
      }

      if (sell.kind === 'import') {
        entries.push({
          rowNumber: sell.rowNumber,
          accountId,
          assetId,
          type: 'sell',
          tradeCalendarDate: calendarDate,
          status: 'blocked',
          blockReason: classifyBlockedSell({
            sellQuantity: quantity,
            priorAvailable,
            sameDayBuyQuantity,
          }),
        })
      }
      // Blocked / unexpected history shortfalls do not consume lots.
    }

    for (const buy of sortBuysForDay(buysOnDay)) {
      const quantity = toNumber(buy.quantity)
      lots.push({
        remainingQuantity: quantity,
        openCalendarDate: calendarDate,
      })
      if (buy.kind === 'import') {
        entries.push({
          rowNumber: buy.rowNumber,
          accountId,
          assetId,
          type: 'buy',
          tradeCalendarDate: calendarDate,
          status: 'ready',
        })
      }
    }
  }

  entries.sort(compareScopeEntriesForDisplay)

  const writeOrderRowNumbers = [...entries]
    .filter((entry) => entry.status === 'ready')
    .sort(compareScopeEntriesForWrite)
    .map((entry) => entry.rowNumber)

  return {
    accountId,
    assetId,
    entries,
    writeOrderRowNumbers,
  }
}

function classifyBlockedSell(params: {
  sellQuantity: number
  priorAvailable: number
  sameDayBuyQuantity: number
}): SellReadinessBlockReason {
  const { sellQuantity, priorAvailable, sameDayBuyQuantity } = params
  const coveredWithSameDay =
    priorAvailable + sameDayBuyQuantity >= sellQuantity - QTY_EPS

  if (sameDayBuyQuantity > QTY_EPS && coveredWithSameDay) {
    return SELL_READINESS_BLOCK_REASONS.SELL_SAME_DAY_ORDER_AMBIGUOUS
  }

  if (priorAvailable <= QTY_EPS) {
    return SELL_READINESS_BLOCK_REASONS.SELL_HISTORY_REQUIRED
  }

  return SELL_READINESS_BLOCK_REASONS.SELL_INSUFFICIENT_LOTS
}

function buildDayTrades(
  history: PlannerHistoryTransaction[],
  candidates: PlannerImportCandidate[],
): DayTrade[] {
  return [
    ...history.map(
      (tx): DayTrade => ({
        kind: 'history',
        type: tx.type,
        tradeCalendarDate: tx.tradeCalendarDate,
        quantity: tx.quantity,
        id: tx.id,
      }),
    ),
    ...candidates.map(
      (row): DayTrade => ({
        kind: 'import',
        type: row.type,
        tradeCalendarDate: row.tradeCalendarDate,
        quantity: row.quantity,
        rowNumber: row.rowNumber,
      }),
    ),
  ]
}

function sortSellsForDay(sells: DayTrade[]): DayTrade[] {
  return [...sells].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'history' ? -1 : 1
    }
    if (a.kind === 'history' && b.kind === 'history') {
      return a.id.localeCompare(b.id)
    }
    if (a.kind === 'import' && b.kind === 'import') {
      return a.rowNumber - b.rowNumber
    }
    return 0
  })
}

function sortBuysForDay(buys: DayTrade[]): DayTrade[] {
  return sortSellsForDay(buys)
}

function compareScopeEntriesForDisplay(a: PlannerScopeEntry, b: PlannerScopeEntry): number {
  return a.rowNumber - b.rowNumber
}

function compareScopeEntriesForWrite(a: PlannerScopeEntry, b: PlannerScopeEntry): number {
  const dateCmp = a.tradeCalendarDate.localeCompare(b.tradeCalendarDate)
  if (dateCmp !== 0) {
    return dateCmp
  }
  // Same calendar day: buys before sells so write order stays deterministic.
  // This must never be used as funding order for same-day sells.
  if (a.type !== b.type) {
    return a.type === 'buy' ? -1 : 1
  }
  return a.rowNumber - b.rowNumber
}

function sumLotsOpenedBefore(lots: Lot[], calendarDate: string): number {
  return lots.reduce((sum, lot) => {
    if (lot.openCalendarDate >= calendarDate) {
      return sum
    }
    return sum + (lot.remainingQuantity > QTY_EPS ? lot.remainingQuantity : 0)
  }, 0)
}

function consumeLotsOpenedBefore(
  lots: Lot[],
  calendarDate: string,
  quantity: number,
): void {
  let remaining = quantity
  for (const lot of lots) {
    if (remaining <= QTY_EPS) {
      return
    }
    if (lot.openCalendarDate >= calendarDate || lot.remainingQuantity <= QTY_EPS) {
      continue
    }
    const take = Math.min(lot.remainingQuantity, remaining)
    lot.remainingQuantity -= take
    remaining -= take
  }
}

function sumQuantity(trades: DayTrade[]): number {
  return trades.reduce((sum, trade) => sum + toNumber(trade.quantity), 0)
}

function collectScopeKeys(
  history: PlannerHistoryTransaction[],
  candidates: PlannerImportCandidate[],
): ScopeKey[] {
  const keys = new Set<ScopeKey>()
  for (const tx of history) {
    keys.add(scopeKey(tx.accountId, tx.assetId))
  }
  for (const row of candidates) {
    keys.add(scopeKey(row.accountId, row.assetId))
  }
  return [...keys].sort()
}

function scopeKey(accountId: string, assetId: string): ScopeKey {
  return `${accountId}::${assetId}`
}

function splitScopeKey(key: ScopeKey): [string, string] {
  const separator = key.indexOf('::')
  return [key.slice(0, separator), key.slice(separator + 2)]
}
