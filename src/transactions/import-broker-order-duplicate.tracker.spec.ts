import { ImportBrokerOrderDuplicateTracker } from './import-broker-order-duplicate.tracker'

describe('ImportBrokerOrderDuplicateTracker', () => {
  it('records the first broker order number and rejects later duplicates in the same file', () => {
    const tracker = new ImportBrokerOrderDuplicateTracker()

    expect(tracker.checkFileDuplicate('BRK-001', 2)).toBeNull()
    expect(tracker.checkFileDuplicate('BRK-001', 3)).toEqual({
      row: 3,
      field: '委託書號',
      message: 'Duplicate broker order number in import file',
    })
  })
})
