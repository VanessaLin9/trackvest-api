import { replayScope } from './position-replay.engine'

export const YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY = 260

function buildYuanta50ReplayFixture() {
  return {
    transactions: [
      {
        type: 'buy' as const,
        tradeTime: new Date('2025-03-03T09:00:00.000Z'),
        quantity: 100,
        amount: 18825,
      },
      {
        type: 'buy' as const,
        tradeTime: new Date('2025-03-10T09:00:00.000Z'),
        quantity: 50,
        amount: 9272.5,
      },
      {
        type: 'sell' as const,
        tradeTime: new Date('2025-05-20T09:00:00.000Z'),
        quantity: 80,
        amount: 14428,
      },
      {
        type: 'sell' as const,
        tradeTime: new Date('2025-07-02T09:00:00.000Z'),
        quantity: 40,
        amount: 1919,
      },
      {
        type: 'buy' as const,
        tradeTime: new Date('2025-07-10T09:00:00.000Z'),
        quantity: 20,
        amount: 998.2,
      },
    ],
    corporateActions: [
      {
        exDate: new Date('2025-06-18T00:00:00.000Z'),
        ratio: 4,
        market: 'tw' as const,
      },
    ],
  }
}

describe('PositionReplay', () => {
  it('replays 0050 split before post-split trades and leaves 260 open shares', () => {
    const result = replayScope(buildYuanta50ReplayFixture())

    expect(result.openQuantity).toBe(YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY)
  })

  it('replays 0050 with a split-adjusted weighted average cost near 47 TWD', () => {
    const result = replayScope(buildYuanta50ReplayFixture())

    expect(result.avgCost).toBeGreaterThan(46)
    expect(result.avgCost).toBeLessThan(48)
  })
})
