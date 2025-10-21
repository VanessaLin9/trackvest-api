import { ApiProperty, IntersectionType } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { AccountBaseDto } from './account.base.dto'

class UserIdOnlyDto {
    @ApiProperty({ example: '3f8b6bfa-...' })
    @IsUUID()
    userId!: string
  }
  
  export class CreateAccountDto extends IntersectionType(
    AccountBaseDto,
    UserIdOnlyDto,
  ) {}