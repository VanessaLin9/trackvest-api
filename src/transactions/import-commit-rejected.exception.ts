import { BadRequestException } from '@nestjs/common'
import { IMPORT_ERROR_CODES } from './import-error-codes'
import { ImportPreviewResult } from './transaction-import-evaluation.types'

export class ImportCommitRejectedException extends BadRequestException {
  constructor(preview: ImportPreviewResult) {
    super({
      totalRows: preview.totalRows,
      successCount: 0,
      failureCount: preview.errorCount,
      errorCode: IMPORT_ERROR_CODES.COMMIT_NOT_ALLOWED_WITH_ERRORS,
      preview,
    })
  }
}
