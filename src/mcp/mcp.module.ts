import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AccountsModule } from '../accounts/accounts.module'
import { CommonModule } from '../common/common.module'
import { GlModule } from '../gl/gl.module'
import { PrismaModule } from '../prisma.module'
import { TransactionsModule } from '../transactions/transactions.module'
import { TrackvestMcpServer } from './mcp.server'
import { PortfolioQueryService } from './services/portfolio-query.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AccountsModule,
    TransactionsModule,
    GlModule,
  ],
  providers: [PortfolioQueryService, TrackvestMcpServer],
})
export class McpModule {}
