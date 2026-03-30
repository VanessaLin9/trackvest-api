import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AccountsService } from '../accounts/accounts.service'
import { OwnershipService } from '../common/services/ownership.service'
import { PrismaService } from '../prisma.service'
import { TrackvestMcpServer } from './mcp.server'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [PrismaService, OwnershipService, AccountsService, TrackvestMcpServer],
})
export class McpModule {}
