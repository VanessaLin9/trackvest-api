import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { AccountsModule } from './accounts/accounts.module'
import { AssetsModule } from './assets/assets.module'
import { CommonModule } from './common/common.module'
import { PrismaClientExceptionFilter } from './common/filters/prisma-exception.filter'
import { AuthGuard } from './common/guards/auth.guard'
import { DashboardModule } from './dashboard/dashboard.module'
import { FxModule } from './fx/fx.module'
import { GlModule } from './gl/gl.module'
import { HealthModule } from './health/health.module'
import { PortfolioModule } from './portfolio/portfolio.module'
import { PrismaModule } from './prisma.module'
import { TransactionsModule } from './transactions/transactions.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    HealthModule,
    UsersModule,
    AssetsModule,
    FxModule,
    AccountsModule,
    GlModule,
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
