import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { UserRole } from '@prisma/client'

export class UserResponseDto {
  @ApiProperty() 
  @Expose() id!: string

  @ApiProperty() 
  @Expose() email!: string

  @ApiProperty({ enum: UserRole }) 
  @Expose() role!: UserRole

  @ApiProperty() 
  @Expose() createdAt!: Date
}
