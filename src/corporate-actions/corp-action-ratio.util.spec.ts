import { roundTwShareQuantity, snapTwSplitRatio } from './corp-action-ratio.util'

describe('corp-action-ratio.util', () => {
  it('snaps 0050 FinMind reference prices to a 1:4 integer ratio', () => {
    expect(snapTwSplitRatio(188.65, 47.16, 'split')).toBe(4)
  })

  it('snaps reverse-split reference prices to an integer inverse ratio', () => {
    expect(snapTwSplitRatio(200, 800, 'reverse_split')).toBe(0.25)
  })

  it('rounds TW share quantities to whole numbers', () => {
    expect(roundTwShareQuantity(120.0063613231552)).toBe(120)
  })
})
