import { NestFactory } from '@nestjs/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { McpModule } from './mcp/mcp.module'
import { TrackvestMcpServer } from './mcp/mcp.server'

/**
 * MCP 獨立 entrypoint（與 HTTP API 分離；PR #8）。
 * stdio transport；日誌走 stderr，避免污染 MCP 協議流。
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(McpModule, {
    logger: ['error', 'warn'],
  })

  try {
    const mcpServer = app.get(TrackvestMcpServer)
    const server = mcpServer.createServer()
    const transport = new StdioServerTransport()

    await server.connect(transport)
    console.error('Trackvest MCP server running on stdio')
  } catch (error) {
    console.error('Failed to start Trackvest MCP server:', error)
    await app.close()
    process.exit(1)
  }
}

bootstrap().catch((error) => {
  console.error('Uncaught MCP bootstrap error:', error)
  process.exit(1)
})
