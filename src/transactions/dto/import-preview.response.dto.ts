import { ApiProperty } from '@nestjs/swagger'
import { IMPORT_ERROR_CODES } from '../import-error-codes'

export class ImportRowIssueDto {
  @ApiProperty({ example: IMPORT_ERROR_CODES.ASSET_ALIAS_NOT_FOUND })
  code!: string

  @ApiProperty({ example: 'assetName' })
  field!: string

  @ApiProperty({ example: 'Asset alias not found for 台積電' })
  message!: string
}

export class ImportResolvedAssetDto {
  @ApiProperty({ example: 'asset-id' })
  id!: string

  @ApiProperty({ example: '2330' })
  symbol!: string

  @ApiProperty({ example: '台積電' })
  name!: string
}

export class ImportPreviewNormalizedTransactionDto {
  @ApiProperty({ example: 'buy', enum: ['buy', 'sell'] })
  type!: 'buy' | 'sell'

  @ApiProperty({ example: '1000' })
  quantity!: string

  @ApiProperty({ example: '1000' })
  unitPrice!: string

  @ApiProperty({ example: 'TWD' })
  currency!: string

  @ApiProperty({ example: '20' })
  fees!: string

  @ApiProperty({ example: '0' })
  taxes!: string
}

export class ImportPreviewRowDto {
  @ApiProperty({ example: 2 })
  row!: number

  @ApiProperty({
    example: 'ready',
    enum: ['ready', 'skipped', 'error', 'warning'],
  })
  status!: 'ready' | 'skipped' | 'error' | 'warning'

  @ApiProperty({ example: '台積電' })
  rawAssetName!: string

  @ApiProperty({ example: 'ABC123' })
  brokerOrderNo!: string

  @ApiProperty({ example: '2026-07-01' })
  tradeDate!: string

  @ApiProperty({ type: ImportResolvedAssetDto, nullable: true })
  resolvedAsset!: ImportResolvedAssetDto | null

  @ApiProperty({ type: ImportPreviewNormalizedTransactionDto, nullable: true })
  normalizedTransaction!: ImportPreviewNormalizedTransactionDto | null

  @ApiProperty({ type: [ImportRowIssueDto] })
  errors!: ImportRowIssueDto[]

  @ApiProperty({ type: [ImportRowIssueDto] })
  warnings!: ImportRowIssueDto[]
}

export class ImportPreviewResponseDto {
  @ApiProperty({ example: 10 })
  totalRows!: number

  @ApiProperty({ example: 8 })
  readyCount!: number

  @ApiProperty({ example: 1 })
  skippedCount!: number

  @ApiProperty({ example: 2 })
  errorCount!: number

  @ApiProperty({ example: 0 })
  warningCount!: number

  @ApiProperty({ example: false })
  canCommit!: boolean

  @ApiProperty({
    example: [3, 2],
    type: [Number],
    description: 'Ready row numbers in chronological write order for commit',
  })
  writeOrderRowNumbers!: number[]

  @ApiProperty({ type: [ImportPreviewRowDto] })
  rows!: ImportPreviewRowDto[]
}
