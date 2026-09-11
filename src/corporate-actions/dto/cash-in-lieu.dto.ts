import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CashInLieuDto {
  @ApiProperty()
  @IsUUID()
  accountId!: string;

  @ApiProperty({
    description: 'Actual net cash received, as a decimal string',
    example: '12.34',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,8})?$/)
  amount!: string;

  @ApiProperty({
    description: 'Fractional shares disposed per broker statement',
    example: '0.5',
  })
  @IsString()
  @Matches(/^0\.\d{1,12}$/)
  quantity!: string;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiProperty({ example: '2025-06-20T00:00:00Z' })
  @IsISO8601({ strict: true })
  paidAt!: string;

  @ApiProperty({ description: 'Broker statement/payment reference' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  reference!: string;
}
