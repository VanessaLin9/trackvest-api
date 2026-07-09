import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { AccountsModule } from './accounts/accounts.module'
import { AssetsModule } from './assets/assets.module'
import { AuthModule } from './auth/auth.module'
import { CommonModule } from './common/common.module'
import { PrismaClientExceptionFilter } from './common/filters/prisma-exception.filter'
import { AuthGuard } from './common/guards/auth.guard'
import { DashboardModule } from './dashboard/dashboard.module'
import { FxModule } from './fx/fx.module'
import { CorporateActionsModule } from './corporate-actions/corporate-actions.module'
import { MarketPriceModule } from './market-price/market-price.module'
import { GlModule } from './gl/gl.module'
import { HealthModule } from './health/health.module'
import { OnboardingModule } from './onboarding/onboarding.module'
import { PortfolioModule } from './portfolio/portfolio.module'
import { PrismaModule } from './prisma.module'
import { TransactionsModule } from './transactions/transactions.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    HealthModule,
    UsersModule,
    AssetsModule,
    FxModule,
    MarketPriceModule,
    CorporateActionsModule,
    AccountsModule,
    GlModule,
    OnboardingModule,
    TransactionsModule,
    DashboardModule,
    PortfolioModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaClientExceptionFilter,
    },
  ],
})
export class AppModule {}
