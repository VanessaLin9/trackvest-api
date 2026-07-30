import { SplitDirection } from './corp-action.types'

/**
 * FinMind before/after 是參考報價，不是精確拆股比（PR #19）。
 * 台股只交易整股，接近整數比時 snap（例如 0050 1:4）。
 */
export function snapTwSplitRatio(
  beforePrice: number,
  afterPrice: number,
  direction: SplitDirection,
): number {
  const raw = beforePrice / afterPrice

  if (direction === 'split') {
    const wholeSharesPerOld = Math.round(raw)
    if (wholeSharesPerOld >= 1 && Math.abs(raw - wholeSharesPerOld) <= 0.05) {
      return wholeSharesPerOld
    }
    return raw
  }

  const oldSharesPerNew = 1 / raw
  const rounded = Math.round(oldSharesPerNew)
  if (rounded >= 1 && Math.abs(oldSharesPerNew - rounded) <= 0.05) {
    return 1 / rounded
  }
  return raw
}

export function roundTwShareQuantity(quantity: number): number {
  return Math.round(quantity)
}
