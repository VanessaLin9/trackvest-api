import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDefined, IsEmail, IsString, Length, ValidateNested } from 'class-validator'
import { OnboardingStarterAccountDto } from './onboarding-starter-account.dto'

export class OnboardingSignupDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string

  @ApiProperty({ example: 'user123' })
  @IsString()
  @Length(6, 100)
  password!: string

  @ApiProperty({ type: OnboardingStarterAccountDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => OnboardingStarterAccountDto)
  starterAccount!: OnboardingStarterAccountDto
}
