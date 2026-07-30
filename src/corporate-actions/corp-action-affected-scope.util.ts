import { PositionReplayScope } from './position-replay.service'

type TransactionScopeRow = {
  accountId: string
  assetId: string | null
}

export function toAffectedScopes(rows: TransactionScopeRow[]): PositionReplayScope[] {
  // 只對有 assetId 的 buy/sell 帳號重放；無部位的 upsert 事件會反映在 replayPending（PR #19）。
  return rows.flatMap((row) =>
    row.assetId ? [{ accountId: row.accountId, assetId: row.assetId }] : [],
  )
}
