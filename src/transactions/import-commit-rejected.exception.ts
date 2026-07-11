import { BadRequestException } from '@nestjs/common'
import { IMPORT_ERROR_CODES, ImportErrorCode } from './import-error-codes'
import { ImportPreviewResult } from './transaction-import-evaluation.types'
import { ImportRunAggregate } from './transaction-import-orchestration.types'

export type ImportCommitRejectedBody = {
  totalRows: number
  successCount: number
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
      failureCount: preview.errorCount,
      errorCode: IMPORT_ERROR_CODES.COMMIT_NOT_ALLOWED_WITH_ERRORS,
      createdTransactionIds: [],
      preview,
    })
  }

  static forPartialCommitFailure(params: {
    preview: ImportPreviewResult
    aggregate: ImportRunAggregate
  }): ImportCommitRejectedException {
    const { preview, aggregate } = params

    return new ImportCommitRejectedException({
      totalRows: preview.totalRows,
      successCount: aggregate.createdTransactionIds.length,
      failureCount: aggregate.errors.length,
      errorCode: IMPORT_ERROR_CODES.IMPORT_COMMIT_FAILED,
      createdTransactionIds: aggregate.createdTransactionIds,
      preview,
    })
  }

  private constructor(body: ImportCommitRejectedBody) {
    super(body)
  }
}
