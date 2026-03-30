import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { AccountsService } from '../../accounts/accounts.service'
import { ACCOUNT_TYPES, CURRENCIES } from '../mcp.constants'
import { resolveOwnerUserId } from '../mcp-context'

export function registerAccountTools(server: McpServer, accountsService: AccountsService) {
  server.registerTool(
    'list_accounts',
    {
      title: 'List Accounts',
      description:
        'List the owner user accounts available to this MCP server. This is a read-only tool for bank, broker, and cash accounts.',
      inputSchema: {
        type: z.enum(ACCOUNT_TYPES).optional().describe('Optional account type filter'),
        currency: z.enum(CURRENCIES).optional().describe('Optional currency filter'),
      },
      outputSchema: {
        ownerUserId: z.string().uuid(),
        accountCount: z.number().int().nonnegative(),
        accounts: z.array(
          z.object({
            id: z.string().uuid(),
            userId: z.string().uuid(),
            name: z.string(),
            type: z.enum(ACCOUNT_TYPES),
            currency: z.enum(CURRENCIES),
            broker: z.string().nullable(),
            createdAt: z.string(),
          }),
        ),
      },
    },
    async ({ type, currency }) => {
      const ownerUserId = resolveOwnerUserId()
      const accounts = await accountsService.findAll(ownerUserId)
      const filteredAccounts = accounts
        .filter((account) => (type ? account.type === type : true))
        .filter((account) => (currency ? account.currency === currency : true))
        .map((account) => ({
          id: account.id,
          userId: account.userId,
          name: account.name,
          type: account.type,
          currency: account.currency,
          broker: account.broker ?? null,
          createdAt: account.createdAt.toISOString(),
        }))

      const structuredContent = {
        ownerUserId,
        accountCount: filteredAccounts.length,
        accounts: filteredAccounts,
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(structuredContent, null, 2),
          },
        ],
        structuredContent,
      }
    },
  )
}
