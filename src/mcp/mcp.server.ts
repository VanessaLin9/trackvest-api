import { Injectable } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AccountsService } from '../accounts/accounts.service'
import { registerAccountTools } from './tools/register-account-tools'

@Injectable()
export class TrackvestMcpServer {
  constructor(private readonly accountsService: AccountsService) {}

  createServer() {
    const server = new McpServer({
      name: 'trackvest-readonly',
      version: '0.1.0',
    })

    registerAccountTools(server, this.accountsService)
    return server
  }
}
