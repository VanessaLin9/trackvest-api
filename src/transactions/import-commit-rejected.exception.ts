import { BadRequestException } from '@nestjs/common'
import { IMPORT_ERROR_CODES, ImportErrorCode } from './import-error-codes'
import { ImportPreviewResult } from './transaction-import-evaluation.types'
import { ImportRunAggregate } from './transaction-import-orchestration.types'

export type ImportCommitRejectedBody = {
  totalRows: number
  successCount: number
  skippedCount: number
  failureCount: number
  errorCode: ImportErrorCode
  createdTransactionIds: string[]
  preview: ImportPreviewResult
}

export class ImportCommitRejectedException extends BadRequestException {
  static forPreviewErrors(preview: ImportPreviewResult): ImportCommitRejectedException {
    return new ImportCommitRejectedException({
      totalRows: preview.totalRows,
      successCount: 0,
      skippedCount: preview.skippedCount,
      failureCount: preview.errorCount,
      errorCode: IMPORT_ERROR_CODES.COMMIT_NOT_ALLOWED_WITH_ERRORS,
      createdTransactionIds: [],
      preview,
    })
  }

  /**
   * Atomic import commit failure contract: the outer transaction rolled back, so
   * no created IDs may be reported as committed.
   */
  static forAtomicCommitFailure(params: {
    preview: ImportPreviewResult
    aggregate: ImportRunAggregate
  }): ImportCommitRejectedException {
    const { preview, aggregate } = params

    return new ImportCommitRejectedException({
      totalRows: preview.totalRows,
      successCount: 0,
      skippedCount: aggregate.skippedCount,
      failureCount: Math.max(aggregate.errors.length, 1),
      errorCode: IMPORT_ERROR_CODES.IMPORT_COMMIT_FAILED,
      createdTransactionIds: [],
      preview,
    })
  }

  private constructor(body: ImportCommitRejectedBody) {
    super(body)
  }
}
