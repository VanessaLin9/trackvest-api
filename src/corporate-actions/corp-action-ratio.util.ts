import { SplitDirection } from './corp-action.types'

/**
 * FinMind before/after prices are reference quotes, not exact split ratios.
 * TW markets trade whole shares only, so snap to the nearest integer ratio
 * when the price-implied value is close (e.g. 0050 1:4 split).
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
