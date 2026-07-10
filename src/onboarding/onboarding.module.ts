import { Module } from '@nestjs/common'
import { AccountsModule } from '../accounts/accounts.module'
import { GlModule } from '../gl/gl.module'
import { OnboardingController } from './onboarding.controller'
import { OnboardingService } from './onboarding.service'

@Module({
  imports: [GlModule, AccountsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
