import { ApiProperty } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { Expose } from 'class-transformer'

export class AuthUserDto {
  @ApiProperty()
  @Expose()
  id!: string

  @ApiProperty()
  @Expose()
  email!: string

  @ApiProperty({ enum: UserRole })
  @Expose()
  role!: UserRole
}
