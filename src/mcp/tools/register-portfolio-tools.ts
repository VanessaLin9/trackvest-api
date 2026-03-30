import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { CURRENCIES } from '../mcp.constants'
import { resolveOwnerUserId } from '../mcp-context'
import { PortfolioQueryService } from '../services/portfolio-query.service'

export function registerPortfolioTools(server: McpServer, portfolioQueryService: PortfolioQueryService) {
  server.registerTool(
    'get_position_detail',
    {
      title: 'Get Position Detail',
      description:
        'Get the current position snapshot for an account and asset, including open lots and recent sell FIFO matches.',
      inputSchema: {
        accountId: z.string().uuid().describe('Account ID'),
        assetId: z.string().uuid().describe('Asset ID'),
      },
      outputSchema: {
        ownerUserId: z.string().uuid(),
        account: z.object({
          id: z.string().uuid(),
          name: z.string(),
          currency: z.enum(CURRENCIES),
          userId: z.string().uuid(),
        }),
        asset: z.object({
          id: z.string().uuid(),
          symbol: z.string(),
          name: z.string(),
          baseCurrency: z.string(),
        }),
        position: z
          .object({
            id: z.string().uuid(),
            quantity: z.number(),
            avgCost: z.number(),
            openedAt: z.string(),
            closedAt: z.string().nullable(),
          })
          .nullable(),
        openLots: z.array(
          z.object({
            id: z.string().uuid(),
            sourceTransactionId: z.string().uuid(),
            originalQuantity: z.number(),
            remainingQuantity: z.number(),
            unitCost: z.number(),
            openedAt: z.string(),
            closedAt: z.string().nullable(),
            sourceTransaction: z.object({
              id: z.string().uuid(),
              tradeTime: z.string(),
              brokerOrderNo: z.string().nullable(),
              note: z.string().nullable(),
            }),
          }),
        ),
        recentSells: z.array(
          z.object({
            id: z.string().uuid(),
            tradeTime: z.string(),
            quantity: z.number().nullable(),
            amount: z.number(),
            price: z.number().nullable(),
            fee: z.number(),
            tax: z.number(),
            brokerOrderNo: z.string().nullable(),
            note: z.string().nullable(),
            matchedQuantity: z.number(),
            matchedCostBasis: z.number(),
            matches: z.array(
              z.object({
                id: z.string().uuid(),
                quantity: z.number(),
                unitCost: z.number(),
                buyLotId: z.string().uuid(),
                buyTransaction: z.object({
                  id: z.string().uuid(),
                  tradeTime: z.string(),
                  brokerOrderNo: z.string().nullable(),
                }),
              }),
            ),
          }),
        ),
      },
    },
    async ({ accountId, assetId }) => {
      const ownerUserId = resolveOwnerUserId()
      const detail = await portfolioQueryService.getPositionDetail(ownerUserId, accountId, assetId)

      const structuredContent = {
        ownerUserId,
        ...detail,
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

  server.registerTool(
    'get_sell_fifo_detail',
    {
      title: 'Get Sell FIFO Detail',
      description:
        'Explain a single sell transaction in FIFO terms, including matched buy lots, cost basis, fee and tax, and realized profit or loss.',
      inputSchema: {
        sellTransactionId: z.string().uuid().describe('Sell transaction ID'),
      },
      outputSchema: {
        ownerUserId: z.string().uuid(),
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
        sellTransaction: z.object({
          id: z.string().uuid(),
          accountId: z.string().uuid(),
          assetId: z.string().uuid().nullable(),
          tradeTime: z.string(),
          quantity: z.number().nullable(),
          amount: z.number(),
          price: z.number().nullable(),
          fee: z.number(),
          tax: z.number(),
          brokerOrderNo: z.string().nullable(),
          note: z.string().nullable(),
          isDeleted: z.boolean(),
          deletedAt: z.string().nullable(),
        }),
        summary: z.object({
          matchedQuantity: z.number(),
          grossProceeds: z.number(),
          netProceeds: z.number(),
          totalCostBasis: z.number(),
          feeAndTax: z.number(),
          realizedPnl: z.number(),
          realizedPnlType: z.enum(['gain', 'loss', 'breakeven']),
        }),
        matches: z.array(
          z.object({
            id: z.string().uuid(),
            quantity: z.number(),
            unitCost: z.number(),
            matchedCostBasis: z.number(),
            buyLot: z.object({
              id: z.string().uuid(),
              sourceTransactionId: z.string().uuid(),
              originalQuantity: z.number(),
              remainingQuantity: z.number(),
              unitCost: z.number(),
              openedAt: z.string(),
              closedAt: z.string().nullable(),
            }),
            buyTransaction: z.object({
              id: z.string().uuid(),
              tradeTime: z.string(),
              brokerOrderNo: z.string().nullable(),
              note: z.string().nullable(),
              amount: z.number(),
              quantity: z.number().nullable(),
              price: z.number().nullable(),
              fee: z.number(),
              tax: z.number(),
              impliedUnitCost: z.number().nullable(),
            }),
          }),
        ),
      },
    },
    async ({ sellTransactionId }) => {
      const ownerUserId = resolveOwnerUserId()
      const detail = await portfolioQueryService.getSellFifoDetail(ownerUserId, sellTransactionId)

      const structuredContent = {
        ownerUserId,
        ...detail,
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
