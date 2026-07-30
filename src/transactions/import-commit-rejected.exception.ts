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

/**
 * Import commit 拒絕回應契約（PR #33）。
 * Preview 擋住寫入用 `forPreviewErrors`；原子寫入失敗用 `forAtomicCommitFailure`（PR #39）。
 */
export class ImportCommitRejectedException extends BadRequestException {
  /** Preview 有不可 commit 狀態時拒絕；尚未寫入任何列。PR #33 */
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
   * 原子 commit 失敗契約：外層 `$transaction` 已 rollback，
   * 回應的 `createdTransactionIds` 必須為空，不可回報半批成功。PR #39
   */
  static forAtomicCommitFailure(params: {
    preview: ImportPreviewResult
    aggregate: ImportRunAggregate
  }): ImportCommitRejectedException {
    const { preview, aggregate } = params

    return new ImportCommitRejectedException({
      totalRows: preview.totalRows,
      successCount: 0,
      skippedCount: preview.skippedCount,
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
