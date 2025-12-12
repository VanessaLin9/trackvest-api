import { ApiProperty } from "@nestjs/swagger"
import { GlAccountType } from "@prisma/client"
import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator"

export class GetAccountDto {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  id!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsUUID()
  userId!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsString()
  name!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsEnum(GlAccountType)
  type!: GlAccountType

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsString()
  currency!: string

  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
  @IsString()
  @IsOptional()
  linkedAccountId?: string
}