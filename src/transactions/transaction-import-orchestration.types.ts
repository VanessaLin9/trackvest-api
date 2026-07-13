import { Currency } from '@prisma/client'

export type ImportRowError = {
  row: number
  field: string
  message: string
}

export type ImportRunAggregate = {
  createdTransactionIds: string[]
  skippedCount: number
  errors: ImportRowError[]
}

export type ImportBrokerAccount = {
  id: string
  type: string
  broker: string | null
  currency: Currency
}

export function createEmptyImportRunAggregate(): ImportRunAggregate {
  return {
    createdTransactionIds: [],
    skippedCount: 0,
    errors: [],
  }
}

export function buildImportTransactionsResponse(
  totalRows: number,
  aggregate: ImportRunAggregate,
) {
  return {
    totalRows,
    successCount: aggregate.createdTransactionIds.length,
    skippedCount: aggregate.skippedCount,
    failureCount: aggregate.errors.length,
    createdTransactionIds: aggregate.createdTransactionIds,
    errors: aggregate.errors,
  }
}
