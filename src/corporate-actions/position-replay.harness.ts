import { SplitDirection } from './corp-action.types'

export const YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY = 260

export type ReplayCorporateAction = {
  exDate: Date
  direction: SplitDirection
  ratio: number
  market: 'tw' | 'us'
}

export type ReplayTransaction = {
  type: 'buy' | 'sell'
  tradeTime: Date
  quantity: number
  amount: number
}

export type ReplayScopeInput = {
  accountId: string
  assetId: string
  transactions: ReplayTransaction[]
  corporateActions: ReplayCorporateAction[]
}

export type ReplayScopeResult = {
  openQuantity: number
  avgCost: number
}

/**
 * CP0 stub. Chronological replay lands in CP1.
 * Returns the unadjusted FIFO outcome from seed-style 0050 trades.
 */
export async function replayScope(_input: ReplayScopeInput): Promise<ReplayScopeResult> {
  return {
    openQuantity: 50,
    avgCost: 131.23,
  }
}

export function buildYuanta50ReplayFixture(): ReplayScopeInput {
  return {
    accountId: 'broker-account',
    assetId: 'yuanta50-asset',
    transactions: [
      {
        type: 'buy',
        tradeTime: new Date('2025-03-03T09:00:00.000Z'),
        quantity: 100,
        amount: 18825,
      },
      {
        type: 'buy',
        tradeTime: new Date('2025-03-10T09:00:00.000Z'),
        quantity: 50,
        amount: 9272.5,
      },
      {
        type: 'sell',
        tradeTime: new Date('2025-05-20T09:00:00.000Z'),
        quantity: 80,
        amount: 14428,
      },
      {
        type: 'sell',
        tradeTime: new Date('2025-07-02T09:00:00.000Z'),
        quantity: 40,
        amount: 1919,
      },
      {
        type: 'buy',
        tradeTime: new Date('2025-07-10T09:00:00.000Z'),
        quantity: 20,
        amount: 998.2,
      },
    ],
    corporateActions: [
      {
        exDate: new Date('2025-06-18T00:00:00.000Z'),
        direction: 'split',
        ratio: 4,
        market: 'tw',
      },
    ],
  }
}
