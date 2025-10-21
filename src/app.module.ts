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

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, TransactionsController, AccountsController, UsersController],
  providers: [PrismaService, TransactionsService, AccountsService, UsersService],
})
export class AppModule {}
