import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { PrismaService } from './prisma.service'
import { TransactionsController } from './transactions/transactions.controller'
import { TransactionsService } from './transactions/transactions.service'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, TransactionsController],
  providers: [PrismaService, TransactionsService],
})
export class AppModule {}
