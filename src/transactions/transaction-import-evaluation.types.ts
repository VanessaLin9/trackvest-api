import {
  COMMIT_BLOCKING_IMPORT_ERROR_CODES,
  ImportErrorCode,
} from './import-error-codes'

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
  /** Ready row numbers in chronological write order from the shared sell-readiness plan. */
  writeOrderRowNumbers: number[]
  rows: ImportPreviewRow[]
}

export function buildImportPreviewResult(
  rows: ImportPreviewRow[],
  writeOrderRowNumbers: number[] = [],
): ImportPreviewResult {
  const readyCount = rows.filter((row) => row.status === 'ready').length
  const skippedCount = rows.filter((row) => row.status === 'skipped').length
  const errorCount = rows.filter((row) => row.status === 'error').length
  const warningCount = rows.filter((row) => row.status === 'warning').length
  const hasCommitBlockingError = rows.some((row) =>
    row.errors.some((issue) => COMMIT_BLOCKING_IMPORT_ERROR_CODES.has(issue.code)),
  )
  const readyRowNumbers = new Set(
    rows.filter((row) => row.status === 'ready').map((row) => row.row),
  )

  return {
    totalRows: rows.length,
    readyCount,
    skippedCount,
    errorCount,
    warningCount,
    canCommit: computeImportCanCommit({
      readyCount,
      skippedCount,
      errorCount,
      hasCommitBlockingError,
      totalRows: rows.length,
    }),
    writeOrderRowNumbers: writeOrderRowNumbers.filter((rowNumber) =>
      readyRowNumbers.has(rowNumber),
    ),
    rows,
  }
}

export function computeImportCanCommit(params: {
  readyCount: number
  skippedCount: number
  errorCount: number
  hasCommitBlockingError: boolean
  totalRows: number
}): boolean {
  const { readyCount, skippedCount, errorCount, hasCommitBlockingError, totalRows } =
    params

  if (totalRows === 0 || hasCommitBlockingError) {
    return false
  }

  if (readyCount > 0) {
    return true
  }

  // All-skipped successful no-op (Branch 2).
  return skippedCount > 0 && errorCount === 0
}
