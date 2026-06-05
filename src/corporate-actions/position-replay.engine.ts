import { CorpActionMarket } from './corp-action.types'
import { roundTwShareQuantity } from './corp-action-ratio.util'
import { toNumber } from '../common/utils/number.util'

export type ReplayTransaction = {
  id: string
  type: 'buy' | 'sell'
  tradeTime: Date
  quantity: number
  amount: number
}

export type ReplayCorporateAction = {
  exDate: Date
  ratio: number
  market: CorpActionMarket
}

export type ReplayScopeInput = {
  transactions: ReplayTransaction[]
  corporateActions: ReplayCorporateAction[]
}

export type ReplayScopeResult = {
  openQuantity: number
  avgCost: number
}

export type ReplayLotState = {
  key: string
  sourceTransactionId: string
  originalQuantity: number
  remainingQuantity: number
  unitCost: number
  openedAt: Date
  closedAt: Date | null
}

export type ReplaySellLotMatch = {
  sellTransactionId: string
  buyLotKey: string
  quantity: number
  unitCost: number
}

export type ReplayLedgerResult = {
  lots: ReplayLotState[]
  sellMatches: ReplaySellLotMatch[]
  position: {
    quantity: number
    avgCost: number
    openedAt: Date
    closedAt: Date | null
  } | null
  sellTransactionIds: string[]
}

type ReplayLot = ReplayLotState

type TimelineEvent =
  | {
      kind: 'split'
      sortTime: Date
      priority: 0
      ratio: number
      market: CorpActionMarket
    }
  | {
      kind: 'buy'
      sortTime: Date
      priority: 1
      sourceTransactionId: string
      quantity: number
      amount: number
    }
  | {
      kind: 'sell'
      sortTime: Date
      priority: 1
      sellTransactionId: string
      quantity: number
    }

export function replayScope(input: ReplayScopeInput): ReplayScopeResult {
  const ledger = replayScopeLedger(input)
  if (!ledger.position) {
    return { openQuantity: 0, avgCost: 0 }
  }

  return {
    openQuantity: ledger.position.quantity,
    avgCost: ledger.position.avgCost,
  }
}

export function replayScopeLedger(input: ReplayScopeInput): ReplayLedgerResult {
  const lots: ReplayLot[] = []
  const sellMatches: ReplaySellLotMatch[] = []
  const sellTransactionIds: string[] = []
  let lotSequence = 0
  let firstOpenedAt: Date | null = null
  let lastClosedAt: Date | null = null

  for (const event of buildTimeline(input)) {
    if (event.kind === 'split') {
      applySplitToOpenLots(lots, event.ratio, event.market)
      continue
    }

    if (event.kind === 'buy') {
      const quantity = toNumber(event.quantity)
      const unitCost = toNumber(event.amount) / quantity
      const openedAt = event.sortTime
      if (!firstOpenedAt) {
        firstOpenedAt = openedAt
      }

      lots.push({
        key: `lot-${lotSequence += 1}`,
        sourceTransactionId: event.sourceTransactionId,
        originalQuantity: quantity,
        remainingQuantity: quantity,
        unitCost,
        openedAt,
        closedAt: null,
      })
      continue
    }

    sellTransactionIds.push(event.sellTransactionId)
    let remainingToSell = toNumber(event.quantity)

    for (const lot of lots) {
      if (remainingToSell <= 1e-9) {
        break
      }
      if (lot.remainingQuantity <= 1e-9) {
        continue
      }

      const consumedQuantity = Math.min(lot.remainingQuantity, remainingToSell)
      lot.remainingQuantity -= consumedQuantity
      remainingToSell -= consumedQuantity

      sellMatches.push({
        sellTransactionId: event.sellTransactionId,
        buyLotKey: lot.key,
        quantity: consumedQuantity,
        unitCost: lot.unitCost,
      })

      if (lot.remainingQuantity <= 1e-9) {
        lot.closedAt = event.sortTime
      }
    }

    if (remainingToSell > 1e-9) {
      throw new Error('sell quantity exceeds open lots during replay')
    }

    const openQuantity = sumOpenQuantity(lots)
    if (openQuantity <= 1e-9) {
      lastClosedAt = event.sortTime
    }
  }

  const openQuantity = sumOpenQuantity(lots)
  const openCost = sumOpenCost(lots)

  if (openQuantity <= 1e-9 || !firstOpenedAt) {
    return {
      lots,
      sellMatches,
      position: null,
      sellTransactionIds,
    }
  }

  return {
    lots,
    sellMatches,
    position: {
      quantity: openQuantity,
      avgCost: openCost / openQuantity,
      openedAt: firstOpenedAt,
      closedAt: lastClosedAt,
    },
    sellTransactionIds,
  }
}

function sumOpenQuantity(lots: ReplayLot[]): number {
  return lots.reduce(
    (sum, lot) => sum + (lot.remainingQuantity > 1e-9 ? lot.remainingQuantity : 0),
    0,
  )
}

function sumOpenCost(lots: ReplayLot[]): number {
  return lots.reduce(
    (sum, lot) =>
      sum + (lot.remainingQuantity > 1e-9 ? lot.remainingQuantity * lot.unitCost : 0),
    0,
  )
}

function buildTimeline(input: ReplayScopeInput): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const action of input.corporateActions) {
    events.push({
      kind: 'split',
      sortTime: action.exDate,
      priority: 0,
      ratio: toNumber(action.ratio),
      market: action.market,
    })
  }

  for (const transaction of input.transactions) {
    if (transaction.type === 'buy') {
      events.push({
        kind: 'buy',
        sortTime: transaction.tradeTime,
        priority: 1,
        sourceTransactionId: transaction.id,
        quantity: toNumber(transaction.quantity),
        amount: toNumber(transaction.amount),
      })
      continue
    }

    events.push({
      kind: 'sell',
      sortTime: transaction.tradeTime,
      priority: 1,
      sellTransactionId: transaction.id,
      quantity: toNumber(transaction.quantity),
    })
  }

  return events.sort((left, right) => {
    const timeDiff = left.sortTime.getTime() - right.sortTime.getTime()
    if (timeDiff !== 0) {
      return timeDiff
    }
    return left.priority - right.priority
  })
}

function applySplitToOpenLots(
  lots: ReplayLot[],
  ratio: number,
  market: CorpActionMarket,
): void {
  if (ratio <= 0 || !Number.isFinite(ratio)) {
    throw new Error('split ratio must be a positive finite number')
  }

  for (const lot of lots) {
    if (lot.remainingQuantity <= 1e-9) {
      continue
    }

    let remainingQuantity = lot.remainingQuantity * ratio
    let originalQuantity = lot.originalQuantity * ratio
    if (market === 'tw') {
      remainingQuantity = roundTwShareQuantity(remainingQuantity)
      originalQuantity = roundTwShareQuantity(originalQuantity)
    }

    lot.remainingQuantity = remainingQuantity
    lot.originalQuantity = originalQuantity
    lot.unitCost = lot.unitCost / ratio
  }
}
