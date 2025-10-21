import { ApiProperty, IntersectionType } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { AccountBaseDto } from './account.base.dto'

class UserIdOnlyDto {
    @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' })
    @IsUUID()
    userId!: string
  }
  
  export class CreateAccountDto extends IntersectionType(
    AccountBaseDto,
    UserIdOnlyDto,
  ) {}