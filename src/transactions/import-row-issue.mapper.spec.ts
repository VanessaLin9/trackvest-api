import { mapImportRowErrorToIssue } from './import-row-issue.mapper'
import { IMPORT_ERROR_CODES } from './import-error-codes'

describe('mapImportRowErrorToIssue', () => {
  it('maps file duplicate broker order errors', () => {
    expect(
      mapImportRowErrorToIssue({
        row: 2,
        field: '委託書號',
        message: 'Duplicate broker order number in import file',
      }),
    ).toEqual({
      code: IMPORT_ERROR_CODES.DUPLICATE_BROKER_ORDER_IN_FILE,
      field: 'brokerOrderNo',
      message: 'Duplicate broker order number in import file',
    })
  })

  it('maps database duplicate broker order errors', () => {
    expect(
      mapImportRowErrorToIssue({
        row: 2,
        field: '委託書號',
        message: 'Duplicate broker order number for selected account',
      }),
    ).toEqual({
      code: IMPORT_ERROR_CODES.DUPLICATE_BROKER_ORDER_IN_ACCOUNT,
      field: 'brokerOrderNo',
      message: 'Duplicate broker order number for selected account',
    })
  })

  it('maps unsupported currency errors', () => {
    expect(
      mapImportRowErrorToIssue({
        row: 2,
        field: '幣別',
        message: 'Unsupported currency: HKD',
      }),
    ).toEqual({
      code: IMPORT_ERROR_CODES.UNSUPPORTED_CURRENCY,
      field: 'currency',
      message: 'Unsupported currency: HKD',
    })
  })

  it('maps currency mismatch errors', () => {
    expect(
      mapImportRowErrorToIssue({
        row: 2,
        field: '幣別',
        message: 'Currency USD does not match account currency TWD',
      }),
    ).toEqual({
      code: IMPORT_ERROR_CODES.CURRENCY_MISMATCH,
      field: 'currency',
      message: 'Currency USD does not match account currency TWD',
    })
  })

  it('maps missing required field errors', () => {
    expect(
      mapImportRowErrorToIssue({
        row: 2,
        field: '股名',
        message: 'Asset name is required',
      }),
    ).toEqual({
      code: IMPORT_ERROR_CODES.MISSING_REQUIRED_FIELD,
      field: 'assetName',
      message: 'Asset name is required',
    })
  })

  it('maps unknown validation errors to INVALID_ROW', () => {
    expect(
      mapImportRowErrorToIssue({
        row: 2,
        field: '成交股數',
        message: 'Quantity must be a positive number',
      }),
    ).toEqual({
      code: IMPORT_ERROR_CODES.INVALID_ROW,
      field: 'quantity',
      message: 'Quantity must be a positive number',
    })
  })
})
