import { ApiProperty } from '@nestjs/swagger'
import { TxType } from '@prisma/client'
import { Expose, Type } from 'class-transformer'

export class TransactionAccountSummaryDto {
  @ApiProperty()
  @Expose()
  id!: string

  @ApiProperty()
  @Expose()
  name!: string

  @ApiProperty()
  @Expose()
  currency!: string

  @ApiProperty()
  @Expose()
  userId!: string
}

export class TransactionAssetSummaryDto {
  @ApiProperty()
  @Expose()
  id!: string

  @ApiProperty()
  @Expose()
  symbol!: string

  @ApiProperty()
  @Expose()
  name!: string

  @ApiProperty()
  @Expose()
  baseCurrency!: string
}

export class TransactionResponseDto {
  @ApiProperty()
  @Expose()
  id!: string

  @ApiProperty()
  @Expose()
  accountId!: string

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  assetId?: string | null

  @ApiProperty({ enum: TxType })
  @Expose()
  type!: TxType

  @ApiProperty({ example: '1000.50', description: '十進位字串，不是 number' })
  @Expose()
  // Prisma Decimal 不是 plain object。@Type(() => String) 才不會無參數 new Decimal()（PR #46）。
  @Type(() => String)
  amount!: string

  @ApiProperty({ required: false, nullable: true, example: '10' })
  @Expose()
  @Type(() => String)
  quantity?: string | null

  @ApiProperty({ required: false, nullable: true, example: '100.05' })
  @Expose()
  @Type(() => String)
  price?: string | null

  @ApiProperty({ required: false, nullable: true, example: '0' })
  @Expose()
  @Type(() => String)
  fee?: string | null

  @ApiProperty({ required: false, nullable: true, example: '0' })
  @Expose()
  @Type(() => String)
  tax?: string | null

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  brokerOrderNo?: string | null

  @ApiProperty({ nullable: true })
  @Expose()
  cashInLieuActionId!: string | null

  @ApiProperty()
  @Expose()
  tradeTime!: Date

  @ApiProperty({ required: false, nullable: true })
  @Expose()
  note?: string | null

  @ApiProperty()
  @Expose()
  isDeleted!: boolean

  @ApiProperty({ nullable: true })
  @Expose()
  deletedAt!: Date | null

  @ApiProperty({ required: false, type: TransactionAccountSummaryDto })
  @Expose()
  @Type(() => TransactionAccountSummaryDto)
  account?: TransactionAccountSummaryDto

  @ApiProperty({ required: false, nullable: true, type: TransactionAssetSummaryDto })
  @Expose()
  @Type(() => TransactionAssetSummaryDto)
  asset?: TransactionAssetSummaryDto | null
}

export class TransactionListResponseDto {
  @ApiProperty()
  @Expose()
  total!: number

  @ApiProperty()
  @Expose()
  skip!: number

  @ApiProperty()
  @Expose()
  take!: number

  @ApiProperty({ type: TransactionResponseDto, isArray: true })
  @Expose()
  @Type(() => TransactionResponseDto)
  items!: TransactionResponseDto[]
}
