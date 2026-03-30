import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AccountsService } from '../accounts/accounts.service'
import { TransactionsService } from '../transactions/transactions.service'
import { registerAccountTools } from './tools/register-account-tools'
import { registerPortfolioTools } from './tools/register-portfolio-tools'
import { registerTransactionTools } from './tools/register-transaction-tools'
import { PortfolioQueryService } from './services/portfolio-query.service'

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
