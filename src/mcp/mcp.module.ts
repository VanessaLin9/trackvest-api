import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AccountsService } from '../accounts/accounts.service'
import { OwnershipService } from '../common/services/ownership.service'
import { GlService } from '../gl/services/gl.service'
import { PostingService } from '../gl/posting.service'
import { PrismaService } from '../prisma.service'
import { TransactionsService } from '../transactions/transactions.service'
import { TrackvestMcpServer } from './mcp.server'
import { PortfolioQueryService } from './services/portfolio-query.service'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    PrismaService,
    OwnershipService,
    GlService,
    PostingService,
    AccountsService,
    TransactionsService,
    PortfolioQueryService,
    TrackvestMcpServer,
  ],
})
export class McpModule {}
