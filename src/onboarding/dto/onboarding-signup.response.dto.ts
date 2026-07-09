import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { AccountResponseDto } from '../../accounts/dto/account.response.dto'
import { UserResponseDto } from '../../users/dto/users.response.dto'

export class OnboardingSignupResponseDto {
  @ApiProperty({ type: UserResponseDto })
  @Expose()
  @Type(() => UserResponseDto)
  user!: UserResponseDto

  @ApiProperty({ type: AccountResponseDto })
  @Expose()
  @Type(() => AccountResponseDto)
  starterAccount!: AccountResponseDto
}
