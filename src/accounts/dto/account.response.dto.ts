// src/accounts/dto/account.response.dto.ts
import { ApiProperty, IntersectionType } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { AccountBaseDto } from './account.base.dto'
import { IsUUID } from 'class-validator'

export class AccountBaseResponseDto {
  @ApiProperty({ example: 'e8e1d0a6-...' })
  @Expose()
  id!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  userId!: string
  
  @ApiProperty({ example: '2025-10-08T05:00:00.000Z' })
  @Expose()
  createdAt!: Date
}
export class AccountResponseDto extends IntersectionType(
  AccountBaseDto,
  AccountBaseResponseDto,
) {}