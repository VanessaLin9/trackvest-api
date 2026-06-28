import { BROKER_IMPORT_HEADER_LABELS } from './broker-import-header.schema'
import { RawBrokerImportRow } from './broker-import-file.parser'

export type ImportRowValidationError = {
  row: number
  field: string
  message: string
}

export type NormalizedImportTransactionRow = {
  rowNumber: number
  assetName: string
  type: 'buy' | 'sell'
  amount: number
  quantity: number
  price: number
  fee: number
  tax: number
  brokerOrderNo: string
  currency: string
  tradeTime: string
  note?: string
}

export type ImportRowValidationResult =
  | { ok: true; row: NormalizedImportTransactionRow }
  | { ok: false; error: ImportRowValidationError }

export function importRowFailure(
  rowNumber: number,
  field: string,
  message: string,
): ImportRowValidationResult {
  return {
    ok: false,
    error: { row: rowNumber, field, message },
  }
}

export { BROKER_IMPORT_HEADER_LABELS as IMPORT_ROW_FIELD_LABELS }
