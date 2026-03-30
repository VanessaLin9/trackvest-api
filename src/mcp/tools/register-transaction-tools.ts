import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TxType } from '@prisma/client'
import * as z from 'zod/v4'
import { toNumber } from '../../common/utils/number.util'
import { TransactionsService } from '../../transactions/transactions.service'
import { CURRENCIES } from '../mcp.constants'
import { resolveOwnerUserId } from '../mcp-context'

export function registerTransactionTools(server: McpServer, transactionsService: TransactionsService) {
  server.registerTool(
    'search_transactions',
    {
      title: 'Search Transactions',
      description:
        'Search transactions for the owner user by account, asset, date range, soft-delete visibility, and pagination.',
      inputSchema: {
        accountId: z.string().uuid().optional().describe('Optional account filter'),
        assetId: z.string().uuid().optional().describe('Optional asset filter'),
        includeDeleted: z
          .boolean()
          .optional()
          .describe('When true, include soft-deleted transactions in the result'),
        from: z.string().optional().describe('Optional ISO 8601 lower bound for tradeTime'),
        to: z.string().optional().describe('Optional ISO 8601 upper bound for tradeTime'),
        skip: z.number().int().min(0).optional().describe('Pagination offset'),
        take: z.number().int().min(1).max(200).optional().describe('Pagination size'),
      },
      outputSchema: {
        ownerUserId: z.string().uuid(),
        total: z.number().int().nonnegative(),
        skip: z.number().int().nonnegative(),
        take: z.number().int().positive(),
        items: z.array(
          z.object({
            id: z.string().uuid(),
            accountId: z.string().uuid(),
            assetId: z.string().uuid().nullable(),
            type: z.nativeEnum(TxType),
            amount: z.number(),
            quantity: z.number().nullable(),
            price: z.number().nullable(),
            fee: z.number(),
            tax: z.number(),
            brokerOrderNo: z.string().nullable(),
            tradeTime: z.string(),
            note: z.string().nullable(),
            isDeleted: z.boolean(),
            deletedAt: z.string().nullable(),
            account: z.object({
              id: z.string().uuid(),
              name: z.string(),
              currency: z.enum(CURRENCIES),
              userId: z.string().uuid(),
            }),
            asset: z
              .object({
                id: z.string().uuid(),
                symbol: z.string(),
                name: z.string(),
                baseCurrency: z.string(),
              })
              .nullable(),
            tags: z.array(
              z.object({
                id: z.string().uuid(),
                name: z.string(),
              }),
            ),
          }),
        ),
      },
    },
    async ({ accountId, assetId, includeDeleted, from, to, skip, take }) => {
      const ownerUserId = resolveOwnerUserId()
      const result = await transactionsService.findAll(
        {
          accountId,
          assetId,
          includeDeleted: includeDeleted ? 'true' : 'false',
          from,
          to,
          skip,
          take,
        },
        ownerUserId,
      )

      const structuredContent = {
        ownerUserId,
        total: result.total,
        skip: result.skip,
        take: result.take,
        items: result.items.map((transaction) => ({
          id: transaction.id,
          accountId: transaction.accountId,
          assetId: transaction.assetId ?? null,
          type: transaction.type,
          amount: toNumber(transaction.amount),
          quantity: transaction.quantity == null ? null : toNumber(transaction.quantity),
          price: transaction.price == null ? null : toNumber(transaction.price),
          fee: toNumber(transaction.fee),
          tax: toNumber(transaction.tax),
          brokerOrderNo: transaction.brokerOrderNo ?? null,
          tradeTime: transaction.tradeTime.toISOString(),
          note: transaction.note ?? null,
          isDeleted: transaction.isDeleted,
          deletedAt: transaction.deletedAt?.toISOString() ?? null,
          account: {
            id: transaction.account.id,
            name: transaction.account.name,
            currency: transaction.account.currency,
            userId: transaction.account.userId,
          },
          asset: transaction.asset
            ? {
                id: transaction.asset.id,
                symbol: transaction.asset.symbol,
                name: transaction.asset.name,
                baseCurrency: transaction.asset.baseCurrency,
              }
            : null,
          tags: transaction.tags.map((tagLink) => ({
            id: tagLink.tag.id,
            name: tagLink.tag.name,
          })),
        })),
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
