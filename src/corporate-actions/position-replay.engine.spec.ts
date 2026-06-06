import { isApproximatelyEqual } from '../common/utils/number.util'
import { replayScope, replayScopeLedger } from './position-replay.engine'
import {
  buildYuanta50ReplayFixture,
  YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY,
  YUANTA50_TRANSACTION_IDS,
} from './position-replay.fixture'

describe('position-replay.engine', () => {
  it('replays 0050 split before post-split trades and leaves 260 open shares', () => {
    const result = replayScope(buildYuanta50ReplayFixture())

    expect(result.openQuantity).toBe(YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY)
  })

  it('replays 0050 with a split-adjusted weighted average cost near 47 TWD', () => {
    const result = replayScope(buildYuanta50ReplayFixture())

    expect(result.avgCost).toBeGreaterThan(46)
    expect(result.avgCost).toBeLessThan(48)
  })

  it('keeps pre-split sell match on pre-split unit cost', () => {
    const ledger = replayScopeLedger(buildYuanta50ReplayFixture())
    const preSplitMatches = ledger.sellMatches.filter(
      (match) => match.sellTransactionId === YUANTA50_TRANSACTION_IDS.sellPreSplit,
    )

    expect(preSplitMatches).toEqual([
      expect.objectContaining({
        quantity: 80,
        unitCost: 188.25,
      }),
    ])
  })

  it('uses split-adjusted unit cost for post-split sell matches', () => {
    const ledger = replayScopeLedger(buildYuanta50ReplayFixture())
    const postSplitMatches = ledger.sellMatches.filter(
      (match) => match.sellTransactionId === YUANTA50_TRANSACTION_IDS.sellPostSplit,
    )

    expect(postSplitMatches).toHaveLength(1)
    expect(postSplitMatches[0]?.quantity).toBe(40)
    expect(isApproximatelyEqual(postSplitMatches[0]?.unitCost ?? 0, 47.0625, 0.01)).toBe(
      true,
    )
  })

  it('reopens position with null closedAt after a full close and later buy', () => {
    const firstBuyDate = new Date('2025-01-10T09:00:00.000Z')
    const sellDate = new Date('2025-02-10T09:00:00.000Z')
    const secondBuyDate = new Date('2025-03-10T09:00:00.000Z')
    const ledger = replayScopeLedger({
      transactions: [
        {
          id: 'buy-1',
          type: 'buy',
          tradeTime: firstBuyDate,
          quantity: 10,
          amount: 1000,
        },
        {
          id: 'sell-1',
          type: 'sell',
          tradeTime: sellDate,
          quantity: 10,
          amount: 1100,
        },
        {
          id: 'buy-2',
          type: 'buy',
          tradeTime: secondBuyDate,
          quantity: 5,
          amount: 550,
        },
      ],
      corporateActions: [],
    })

    expect(ledger.position).toEqual({
      quantity: 5,
      avgCost: 110,
      openedAt: secondBuyDate,
      closedAt: null,
    })
  })

  it('is deterministic when replaying the same fixture twice', () => {
    const fixture = buildYuanta50ReplayFixture()
    const first = replayScopeLedger(fixture)
    const second = replayScopeLedger(fixture)

    expect(second).toEqual(first)
  })
})
