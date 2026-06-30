import { Currency } from '@prisma/client'
import { IMPORT_ROW_FIELD_LABELS } from './transaction-import-row.types'
import { ImportRowError } from './transaction-import-orchestration.types'

export function validateImportRowCurrency(
  rawCurrency: string,
  accountCurrency: Currency,
  rowNumber: number,
): ImportRowError | null {
  const currency = normalizeImportCurrency(rawCurrency)
  if (!currency) {
    return {
      row: rowNumber,
      field: IMPORT_ROW_FIELD_LABELS.currency,
      message: `Unsupported currency: ${rawCurrency}`,
    }
  }

  if (currency !== accountCurrency) {
    return {
      row: rowNumber,
      field: IMPORT_ROW_FIELD_LABELS.currency,
      message: `Currency ${rawCurrency} does not match account currency ${accountCurrency}`,
    }
  }

  return null
}

function normalizeImportCurrency(value: string): Currency | null {
  const normalized = value.trim().toUpperCase()
  switch (normalized) {
    case 'TWD':
    case '台幣':
    case '新台幣':
      return Currency.TWD
    case 'USD':
    case '美元':
    case '美金':
      return Currency.USD
    case 'JPY':
    case '日圓':
    case '日元':
      return Currency.JPY
    case 'EUR':
    case '歐元':
      return Currency.EUR
    default:
      return null
  }
}
