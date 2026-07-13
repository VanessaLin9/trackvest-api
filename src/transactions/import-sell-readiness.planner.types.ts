/**
 * Pure planning types for import sell-readiness (Branch 3 Task 1).
 * Calendar dates are broker local YYYY-MM-DD strings — never derive same-day
 * policy from UTC day-of Date, because Cathay import uses local midnight.
 */

export const SELL_READINESS_BLOCK_REASONS = {
  SELL_HISTORY_REQUIRED: 'SELL_HISTORY_REQUIRED',
  SELL_INSUFFICIENT_LOTS: 'SELL_INSUFFICIENT_LOTS',
  SELL_SAME_DAY_ORDER_AMBIGUOUS: 'SELL_SAME_DAY_ORDER_AMBIGUOUS',
} as const

export type SellReadinessBlockReason =
  (typeof SELL_READINESS_BLOCK_REASONS)[keyof typeof SELL_READINESS_BLOCK_REASONS]

export type PlannerTradeSide = 'buy' | 'sell'

export type PlannerHistoryTransaction = {
  id: string
  accountId: string
  assetId: string
  type: PlannerTradeSide
  /** Broker-local calendar date YYYY-MM-DD */
  tradeCalendarDate: string
  quantity: number
}

export type PlannerImportCandidate = {
  rowNumber: number
  accountId: string
  assetId: string
  type: PlannerTradeSide
  /** Broker-local calendar date YYYY-MM-DD */
  tradeCalendarDate: string
  quantity: number
}

export type PlannerEntryStatus = 'ready' | 'blocked'

export type PlannerScopeEntry = {
  rowNumber: number
  accountId: string
  assetId: string
  type: PlannerTradeSide
  tradeCalendarDate: string
  status: PlannerEntryStatus
  blockReason?: SellReadinessBlockReason
}

export type PlannerScopePlan = {
  accountId: string
  assetId: string
  entries: PlannerScopeEntry[]
  /** Ready import row numbers in chronological write order */
  writeOrderRowNumbers: number[]
}

export type ImportSellReadinessPlan = {
  scopes: PlannerScopePlan[]
  /** Flat chronological write order across scopes (stable by accountId, assetId) */
  writeOrderRowNumbers: number[]
}

export type PlanImportSellReadinessInput = {
  history: PlannerHistoryTransaction[]
  /** Already-validated, non-skipped import candidates only */
  candidates: PlannerImportCandidate[]
}
