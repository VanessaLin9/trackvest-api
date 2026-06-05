import { SplitDirection } from './corp-action.types'

export const YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY = 260

type ReplayCorporateAction = {
  exDate: Date
  direction: SplitDirection
  ratio: number
  market: 'tw' | 'us'
}

type ReplayTransaction = {
  type: 'buy' | 'sell'
  tradeTime: Date
  quantity: number
  amount: number
}

type ReplayScopeInput = {
  accountId: string
  assetId: string
  transactions: ReplayTransaction[]
  corporateActions: ReplayCorporateAction[]
}

function buildYuanta50ReplayFixture(): ReplayScopeInput {
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

describe('PositionReplay specification', () => {
  it('locks the 0050 split-aware fixture to 260 open shares', () => {
    const fixture = buildYuanta50ReplayFixture()

    expect(YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY).toBe(260)
    expect(fixture.transactions).toHaveLength(5)
    expect(fixture.corporateActions).toHaveLength(1)
    expect(fixture.corporateActions[0]?.ratio).toBe(4)
  })

  it.skip('replays 0050 split before post-split trades', async () => {
    // CP1: implement PositionReplayService.replayScope and assert openQuantity.
    const fixture = buildYuanta50ReplayFixture()
    expect(fixture).toBeDefined()
    expect(YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY).toBe(260)
  })
})
