import { ImportRowError } from './transaction-import-orchestration.types'

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
