import { Currency } from '@prisma/client'

export type ImportRowError = {
  row: number
  field: string
  message: string
}

export type ImportRunAggregate = {
  createdTransactionIds: string[]
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
    failureCount: aggregate.errors.length,
    createdTransactionIds: aggregate.createdTransactionIds,
    errors: aggregate.errors,
  }
}
