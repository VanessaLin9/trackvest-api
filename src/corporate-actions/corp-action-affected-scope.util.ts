import { PositionReplayScope } from './position-replay.service'

type TransactionScopeRow = {
  accountId: string
  assetId: string | null
}

export function toAffectedScopes(rows: TransactionScopeRow[]): PositionReplayScope[] {
  return rows.flatMap((row) =>
    row.assetId ? [{ accountId: row.accountId, assetId: row.assetId }] : [],
  )
}
