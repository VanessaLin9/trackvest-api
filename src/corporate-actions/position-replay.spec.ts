import { replayScope } from './position-replay.engine'
import {
  buildYuanta50ReplayFixture,
  YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY,
} from './position-replay.fixture'

describe('PositionReplay', () => {
  it('replays 0050 split before post-split trades and leaves 260 open shares', () => {
    const result = replayScope(buildYuanta50ReplayFixture())

    expect(result.openQuantity).toBe(YUANTA50_REPLAY_EXPECTED_OPEN_QUANTITY)
  })
})
