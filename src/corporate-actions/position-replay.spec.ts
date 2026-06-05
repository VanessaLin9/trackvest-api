import {
  buildYuanta50ReplayFixture,
  replayScope,
  YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY,
} from './position-replay.harness'

describe('PositionReplay', () => {
  it('replays 0050 split before post-split trades and leaves 260 open shares', async () => {
    const result = await replayScope(buildYuanta50ReplayFixture())

    expect(result.openQuantity).toBe(YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY)
  })
})
