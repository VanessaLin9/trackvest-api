import { CorpActionMarket } from './corp-action.types'
import { roundTwShareQuantity } from './corp-action-ratio.util'
import { toNumber } from '../common/utils/number.util'

export type ReplayTransaction = {
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

type ReplayLot = {
  id: string
  remainingQuantity: number
  unitCost: number
  openedAt: Date
}

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
      quantity: number
      amount: number
    }
  | {
      kind: 'sell'
      sortTime: Date
      priority: 1
      quantity: number
    }

export function replayScope(input: ReplayScopeInput): ReplayScopeResult {
  const lots: ReplayLot[] = []
  let lotSequence = 0

  for (const event of buildTimeline(input)) {
    if (event.kind === 'split') {
      applySplitToOpenLots(lots, event.ratio, event.market)
      continue
    }

    if (event.kind === 'buy') {
      const quantity = toNumber(event.quantity)
      const unitCost = toNumber(event.amount) / quantity
      lots.push({
        id: `lot-${lotSequence += 1}`,
        remainingQuantity: quantity,
        unitCost,
        openedAt: event.sortTime,
      })
      continue
    }

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
    }

    if (remainingToSell > 1e-9) {
      throw new Error('sell quantity exceeds open lots during replay')
    }
  }

  const openQuantity = lots.reduce(
    (sum, lot) => sum + (lot.remainingQuantity > 1e-9 ? lot.remainingQuantity : 0),
    0,
  )
  const openCost = lots.reduce(
    (sum, lot) =>
      sum + (lot.remainingQuantity > 1e-9 ? lot.remainingQuantity * lot.unitCost : 0),
    0,
  )

  return {
    openQuantity,
    avgCost: openQuantity > 1e-9 ? openCost / openQuantity : 0,
  }
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
        quantity: toNumber(transaction.quantity),
        amount: toNumber(transaction.amount),
      })
      continue
    }

    events.push({
      kind: 'sell',
      sortTime: transaction.tradeTime,
      priority: 1,
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
    if (market === 'tw') {
      remainingQuantity = roundTwShareQuantity(remainingQuantity)
    }

    lot.remainingQuantity = remainingQuantity
    lot.unitCost = lot.unitCost / ratio
  }
}
