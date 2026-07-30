import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AccountsService } from '../accounts/accounts.service'
import { TransactionsService } from '../transactions/transactions.service'
import { registerAccountTools } from './tools/register-account-tools'
import { registerPortfolioTools } from './tools/register-portfolio-tools'
import { registerTransactionTools } from './tools/register-transaction-tools'
import { PortfolioQueryService } from './services/portfolio-query.service'

/**
 * Read-only MCP tool surface（PR #8）：accounts／transactions／portfolio 查詢。
 * 不掛寫入工具；owner 由 `resolveOwnerUserId`（env／預設）決定。
 */
@Injectable()
export class TrackvestMcpServer {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly transactionsService: TransactionsService,
    private readonly portfolioQueryService: PortfolioQueryService,
  ) {}

  createServer() {
    const server = new McpServer({
      name: 'trackvest-readonly',
      version: '0.1.0',
    })

    registerAccountTools(server, this.accountsService)
    registerTransactionTools(server, this.transactionsService)
    registerPortfolioTools(server, this.portfolioQueryService)
    return server
  }
}
