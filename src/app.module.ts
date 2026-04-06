import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { PrismaService } from './prisma.service'
import { TransactionsController } from './transactions/transactions.controller'
import { TransactionsService } from './transactions/transactions.service'
import { AccountsController } from './accounts/accounts.controller'
import { AccountsService } from './accounts/accounts.service'
import { UsersService } from './users/users.service'
import { UsersController } from './users/users.controller'
import { AssetsController } from './assets/assets.controller'
import { AssetsService } from './assets/assets.service'
import { GlController } from './gl/gl.controller'
import { PostingService } from './gl/posting.service'
import { OwnershipService } from './common/services/ownership.service'
import { GlService } from './gl/services/gl.service'
import { DashboardController } from './dashboard/dashboard.controller'
import { DashboardService } from './dashboard/dashboard.service'
import { PortfolioController } from './portfolio/portfolio.controller'
import { PortfolioService } from './portfolio/portfolio.service'
import { FX_RATE_PROVIDER } from './fx/fx-rate.types'
import { FrankfurterFxRateProvider } from './fx/providers/frankfurter-fx-rate.provider'
import { FxRateService } from './fx/fx-rate.service'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, DashboardController, PortfolioController, TransactionsController, AccountsController, UsersController, AssetsController, GlController],
  providers: [
    PrismaService,
    DashboardService,
    PortfolioService,
    FxRateService,
    FrankfurterFxRateProvider,
    {
      provide: FX_RATE_PROVIDER,
      useExisting: FrankfurterFxRateProvider,
    },
    TransactionsService,
    AccountsService,
    UsersService,
    AssetsService,
    PostingService,
    OwnershipService,
    GlService,
  ],
  exports: [OwnershipService], // Export so it can be used in other modules if needed
})
export class AppModule {}
