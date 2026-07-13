import { ImportErrorCode } from './import-error-codes'

export type ImportPreviewRowStatus = 'ready' | 'skipped' | 'error' | 'warning'

export type ImportRowIssue = {
  code: ImportErrorCode
  field: string
  message: string
}

export type ImportResolvedAsset = {
  id: string
  symbol: string
  name: string
}

export type ImportPreviewNormalizedTransaction = {
  type: 'buy' | 'sell'
  quantity: string
  unitPrice: string
  currency: string
  fees: string
  taxes: string
}

export type ImportPreviewRow = {
  row: number
  status: ImportPreviewRowStatus
  rawAssetName: string
  brokerOrderNo: string
  tradeDate: string
  resolvedAsset: ImportResolvedAsset | null
  normalizedTransaction: ImportPreviewNormalizedTransaction | null
  errors: ImportRowIssue[]
  warnings: ImportRowIssue[]
}

export type ImportPreviewResult = {
  totalRows: number
  readyCount: number
  skippedCount: number
  errorCount: number
  warningCount: number
  canCommit: boolean
  rows: ImportPreviewRow[]
}

export function buildImportPreviewResult(rows: ImportPreviewRow[]): ImportPreviewResult {
  const readyCount = rows.filter((row) => row.status === 'ready').length
  const skippedCount = rows.filter((row) => row.status === 'skipped').length
  const errorCount = rows.filter((row) => row.status === 'error').length
  const warningCount = rows.filter((row) => row.status === 'warning').length

  return {
    totalRows: rows.length,
    readyCount,
    skippedCount,
    errorCount,
    warningCount,
    // Skipped rows are neutral. All-skipped uploads are a successful no-op.
    canCommit: rows.length > 0 && errorCount === 0,
    rows,
  }
}
