import { BROKER_IMPORT_HEADER_LABELS } from './broker-import-header.schema'
import { IMPORT_ERROR_CODES } from './import-error-codes'
import { ImportRowError } from './transaction-import-orchestration.types'
import { ImportRowIssue } from './transaction-import-evaluation.types'

const HEADER_LABEL_TO_API_FIELD = Object.fromEntries(
  Object.entries(BROKER_IMPORT_HEADER_LABELS).map(([apiField, label]) => [
    label,
    apiField,
  ]),
) as Record<string, string>

export function mapImportRowErrorToIssue(error: ImportRowError): ImportRowIssue {
  return {
    code: resolveImportRowErrorCode(error),
    field: mapImportRowFieldToApiField(error.field),
    message: error.message,
  }
}

function mapImportRowFieldToApiField(field: string): string {
  return HEADER_LABEL_TO_API_FIELD[field] ?? field
}

function resolveImportRowErrorCode(error: ImportRowError): ImportRowIssue['code'] {
  if (error.message === 'Duplicate broker order number in import file') {
    return IMPORT_ERROR_CODES.DUPLICATE_BROKER_ORDER_IN_FILE
  }

  if (error.message === 'Duplicate broker order number for selected account') {
    return IMPORT_ERROR_CODES.DUPLICATE_BROKER_ORDER_ALREADY_IMPORTED
  }

  if (error.message.startsWith('Unsupported currency:')) {
    return IMPORT_ERROR_CODES.UNSUPPORTED_CURRENCY
  }

  if (error.message.includes('does not match account currency')) {
    return IMPORT_ERROR_CODES.CURRENCY_MISMATCH
  }

  if (error.message.startsWith('Asset alias not found for')) {
    return IMPORT_ERROR_CODES.ASSET_ALIAS_NOT_FOUND
  }

  if (error.message.endsWith('is required')) {
    return IMPORT_ERROR_CODES.MISSING_REQUIRED_FIELD
  }

  return IMPORT_ERROR_CODES.INVALID_ROW
}
