import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'
import { OwnershipService } from '../../common/services/ownership.service'
import { toNumber } from '../../common/utils/number.util'

@Injectable()
export class PortfolioQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownershipService: OwnershipService,
  ) {}

  async getPositionDetail(userId: string, accountId: string, assetId: string) {
    await this.ownershipService.validateAccountOwnership(accountId, userId)

    const [account, asset, position, openLots, recentSells] = await Promise.all([
      this.prisma.account.findUnique({
        where: { id: accountId },
        select: { id: true, name: true, currency: true, userId: true },
      }),
      this.prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true, symbol: true, name: true, baseCurrency: true },
      }),
      this.prisma.position.findFirst({
        where: { accountId, assetId },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.positionLot.findMany({
        where: {
          accountId,
          assetId,
          remainingQuantity: { gt: 0 },
        },
        orderBy: { openedAt: 'asc' },
        include: {
          sourceTransaction: {
            select: {
              id: true,
              tradeTime: true,
              brokerOrderNo: true,
              note: true,
            },
          },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          accountId,
          assetId,
          type: 'sell',
          isDeleted: false,
        },
        orderBy: { tradeTime: 'desc' },
        take: 10,
        include: {
          sellLotMatches: {
            include: {
              buyLot: {
                include: {
                  sourceTransaction: {
                    select: {
                      id: true,
                      tradeTime: true,
                      brokerOrderNo: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ])

    if (!account) {
      throw new NotFoundException('Account not found')
    }

    if (!asset) {
      throw new NotFoundException('Asset not found')
    }

    return {
      account,
      asset,
      position: position
        ? {
            id: position.id,
            quantity: toNumber(position.quantity),
            avgCost: toNumber(position.avgCost),
            openedAt: position.openedAt.toISOString(),
            closedAt: position.closedAt?.toISOString() ?? null,
          }
        : null,
      openLots: openLots.map((lot) => ({
        id: lot.id,
        sourceTransactionId: lot.sourceTransactionId,
        originalQuantity: toNumber(lot.originalQuantity),
        remainingQuantity: toNumber(lot.remainingQuantity),
        unitCost: toNumber(lot.unitCost),
        openedAt: lot.openedAt.toISOString(),
        closedAt: lot.closedAt?.toISOString() ?? null,
        sourceTransaction: {
          id: lot.sourceTransaction.id,
          tradeTime: lot.sourceTransaction.tradeTime.toISOString(),
          brokerOrderNo: lot.sourceTransaction.brokerOrderNo ?? null,
          note: lot.sourceTransaction.note ?? null,
        },
      })),
      recentSells: recentSells.map((transaction) => {
        const matchedQuantity = transaction.sellLotMatches.reduce(
          (sum, match) => sum + toNumber(match.quantity),
          0,
        )
        const matchedCostBasis = transaction.sellLotMatches.reduce(
          (sum, match) => sum + toNumber(match.quantity) * toNumber(match.unitCost),
          0,
        )

        return {
          id: transaction.id,
          tradeTime: transaction.tradeTime.toISOString(),
          quantity: transaction.quantity == null ? null : toNumber(transaction.quantity),
          amount: toNumber(transaction.amount),
          price: transaction.price == null ? null : toNumber(transaction.price),
          fee: toNumber(transaction.fee),
          tax: toNumber(transaction.tax),
          brokerOrderNo: transaction.brokerOrderNo ?? null,
          note: transaction.note ?? null,
          matchedQuantity,
          matchedCostBasis,
          matches: transaction.sellLotMatches.map((match) => ({
            id: match.id,
            quantity: toNumber(match.quantity),
            unitCost: toNumber(match.unitCost),
            buyLotId: match.buyLotId,
            buyTransaction: {
              id: match.buyLot.sourceTransaction.id,
              tradeTime: match.buyLot.sourceTransaction.tradeTime.toISOString(),
              brokerOrderNo: match.buyLot.sourceTransaction.brokerOrderNo ?? null,
            },
          })),
        }
      }),
    }
  }
}
