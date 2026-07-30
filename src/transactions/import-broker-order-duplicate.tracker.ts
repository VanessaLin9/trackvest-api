import { ImportRowError } from './transaction-import-orchestration.types'

/**
 * 單次匯入檔內委託書號追蹤（PR #31）。
 * 檔內重複 → `DUPLICATE_BROKER_ORDER_IN_FILE`，是唯一 COMMIT_BLOCKING（PR #33）。
 */
export class ImportBrokerOrderDuplicateTracker {
  private readonly seenBrokerOrderNumbers = new Set<string>()

  checkFileDuplicate(
    brokerOrderNo: string,
    rowNumber: number,
  ): ImportRowError | null {
    if (this.seenBrokerOrderNumbers.has(brokerOrderNo)) {
      return {
        row: rowNumber,
        field: '委託書號',
        message: 'Duplicate broker order number in import file',
      }
    }

    this.seenBrokerOrderNumbers.add(brokerOrderNo)
    return null
  }
}
