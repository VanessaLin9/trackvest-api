import { ApiProperty } from '@nestjs/swagger'
import { IMPORT_ERROR_CODES } from '../import-error-codes'
import { ImportPreviewResponseDto } from './import-preview.response.dto'

export class ImportCommitRejectedResponseDto {
  @ApiProperty({ example: 10 })
  totalRows!: number

  @ApiProperty({ example: 0 })
  successCount!: number

  @ApiProperty({ example: 2 })
  failureCount!: number

  @ApiProperty({ example: IMPORT_ERROR_CODES.COMMIT_NOT_ALLOWED_WITH_ERRORS })
  errorCode!: string

  @ApiProperty({ type: ImportPreviewResponseDto })
  preview!: ImportPreviewResponseDto
}
