import { IsOptional, IsBoolean, IsNumber, Min, IsEnum, IsUUID } from 'class-validator'
import { Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { TxType } from '@prisma/client'

export class QueryTransactionsDto {
  @ApiPropertyOptional({ description: 'Include soft-deleted transactions', example: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  includeDeleted?: boolean

  @ApiPropertyOptional({ description: 'Page number', example: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ description: 'Items per page', example: 50, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  limit?: number = 50

  @ApiPropertyOptional({ description: 'Filter by account ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  accountId?: string

  @ApiPropertyOptional({ description: 'Filter by asset ID', example: '123e4567-e89b-12d3-a456-426614174001' })
  @IsOptional()
  @IsUUID()
  assetId?: string

  @ApiPropertyOptional({ description: 'Filter by transaction type', enum: TxType, example: 'buy' })
  @IsOptional()
  @IsEnum(TxType)
  type?: TxType
}
