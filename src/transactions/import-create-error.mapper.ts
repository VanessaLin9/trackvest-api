import { Prisma } from '@prisma/client'
import { ImportRowError } from './transaction-import-orchestration.types'

export function mapImportCreateError(
  error: unknown,
  rowNumber: number,
): ImportRowError {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return {
      row: rowNumber,
      field: '委託書號',
      message: 'Duplicate broker order number for selected account',
    }
  }

  return {
    row: rowNumber,
    field: 'row',
    message: error instanceof Error ? error.message : 'Failed to import row',
  }
}
