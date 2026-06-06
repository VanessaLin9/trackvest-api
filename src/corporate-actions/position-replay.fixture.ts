import { ReplayScopeInput } from './position-replay.engine'

export const YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY = 260

export const YUANTA50_TRANSACTION_IDS = {
  buyLot1: 'tx-buy-lot-1',
  buyLot2: 'tx-buy-lot-2',
  sellPreSplit: 'tx-sell-pre-split',
  sellPostSplit: 'tx-sell-post-split',
  buyPostSplit: 'tx-buy-post-split',
} as const

export function buildYuanta50ReplayFixture(): ReplayScopeInput {
  return {
    transactions: [
      {
        id: YUANTA50_TRANSACTION_IDS.buyLot1,
        type: 'buy',
        tradeTime: new Date('2025-03-03T09:00:00.000Z'),
        quantity: 100,
        amount: 18825,
      },
      {
        id: YUANTA50_TRANSACTION_IDS.buyLot2,
        type: 'buy',
        tradeTime: new Date('2025-03-10T09:00:00.000Z'),
        quantity: 50,
        amount: 9272.5,
      },
      {
        id: YUANTA50_TRANSACTION_IDS.sellPreSplit,
        type: 'sell',
        tradeTime: new Date('2025-05-20T09:00:00.000Z'),
        quantity: 80,
        amount: 14428,
      },
      {
        id: YUANTA50_TRANSACTION_IDS.sellPostSplit,
        type: 'sell',
        tradeTime: new Date('2025-07-02T09:00:00.000Z'),
        quantity: 40,
        amount: 1919,
      },
      {
        id: YUANTA50_TRANSACTION_IDS.buyPostSplit,
        type: 'buy',
        tradeTime: new Date('2025-07-10T09:00:00.000Z'),
        quantity: 20,
        amount: 998.2,
      },
    ],
    corporateActions: [
      {
        exDate: new Date('2025-06-18T00:00:00.000Z'),
        ratio: 4,
        market: 'tw',
      },
    ],
  }
}
