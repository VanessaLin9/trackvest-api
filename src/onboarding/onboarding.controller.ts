import { Body, Controller, Post } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger'
import { ErrorResponse } from '../common/dto'
import { Public } from '../common/decorators/public.decorator'
import { Serialize } from '../common/interceptors/serialize.interceptor'
import { OnboardingSignupDto } from './dto/onboarding-signup.dto'
import { OnboardingSignupResponseDto } from './dto/onboarding-signup.response.dto'
import { OnboardingService } from './onboarding.service'

@ApiTags('onboarding')
@Controller('onboarding')
@ApiBadRequestResponse({ type: ErrorResponse })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('signup')
  @Public()
  @Serialize(OnboardingSignupResponseDto)
  @ApiCreatedResponse({ type: OnboardingSignupResponseDto })
  @ApiConflictResponse({ type: ErrorResponse })
  async signup(@Body() dto: OnboardingSignupDto) {
    return this.onboardingService.signup(dto)
  }
}
