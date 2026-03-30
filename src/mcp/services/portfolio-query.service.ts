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

  async getSellFifoDetail(userId: string, sellTransactionId: string) {
    await this.ownershipService.validateTransactionOwnership(sellTransactionId, userId)

    const sellTransaction = await this.prisma.transaction.findUnique({
      where: { id: sellTransactionId },
      include: {
        account: {
          select: { id: true, name: true, currency: true, userId: true },
        },
        asset: {
          select: { id: true, symbol: true, name: true, baseCurrency: true },
        },
        sellLotMatches: {
          include: {
            buyLot: {
              include: {
                sourceTransaction: {
                  select: {
                    id: true,
                    tradeTime: true,
                    brokerOrderNo: true,
                    note: true,
                    amount: true,
                    quantity: true,
                    price: true,
                    fee: true,
                    tax: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!sellTransaction) {
      throw new NotFoundException('Transaction not found')
    }

    if (sellTransaction.type !== 'sell') {
      throw new NotFoundException('Sell transaction not found')
    }

    const grossProceeds = toNumber(sellTransaction.amount) + toNumber(sellTransaction.fee) + toNumber(sellTransaction.tax)
    const matchedQuantity = sellTransaction.sellLotMatches.reduce(
      (sum, match) => sum + toNumber(match.quantity),
      0,
    )
    const totalCostBasis = sellTransaction.sellLotMatches.reduce(
      (sum, match) => sum + toNumber(match.quantity) * toNumber(match.unitCost),
      0,
    )
    const realizedPnl = grossProceeds - totalCostBasis

    return {
      account: sellTransaction.account,
      asset: sellTransaction.asset,
      sellTransaction: {
        id: sellTransaction.id,
        accountId: sellTransaction.accountId,
        assetId: sellTransaction.assetId ?? null,
        tradeTime: sellTransaction.tradeTime.toISOString(),
        quantity: sellTransaction.quantity == null ? null : toNumber(sellTransaction.quantity),
        amount: toNumber(sellTransaction.amount),
        price: sellTransaction.price == null ? null : toNumber(sellTransaction.price),
        fee: toNumber(sellTransaction.fee),
        tax: toNumber(sellTransaction.tax),
        brokerOrderNo: sellTransaction.brokerOrderNo ?? null,
        note: sellTransaction.note ?? null,
        isDeleted: sellTransaction.isDeleted,
        deletedAt: sellTransaction.deletedAt?.toISOString() ?? null,
      },
      summary: {
        matchedQuantity,
        grossProceeds,
        netProceeds: toNumber(sellTransaction.amount),
        totalCostBasis,
        feeAndTax: toNumber(sellTransaction.fee) + toNumber(sellTransaction.tax),
        realizedPnl,
        realizedPnlType:
          realizedPnl > 0 ? 'gain' : realizedPnl < 0 ? 'loss' : 'breakeven',
      },
      matches: sellTransaction.sellLotMatches.map((match) => {
        const sourceQuantity = match.buyLot.sourceTransaction.quantity == null
          ? null
          : toNumber(match.buyLot.sourceTransaction.quantity)
        const sourceAmount = toNumber(match.buyLot.sourceTransaction.amount)

        return {
          id: match.id,
          quantity: toNumber(match.quantity),
          unitCost: toNumber(match.unitCost),
          matchedCostBasis: toNumber(match.quantity) * toNumber(match.unitCost),
          buyLot: {
            id: match.buyLot.id,
            sourceTransactionId: match.buyLot.sourceTransactionId,
            originalQuantity: toNumber(match.buyLot.originalQuantity),
            remainingQuantity: toNumber(match.buyLot.remainingQuantity),
            unitCost: toNumber(match.buyLot.unitCost),
            openedAt: match.buyLot.openedAt.toISOString(),
            closedAt: match.buyLot.closedAt?.toISOString() ?? null,
          },
          buyTransaction: {
            id: match.buyLot.sourceTransaction.id,
            tradeTime: match.buyLot.sourceTransaction.tradeTime.toISOString(),
            brokerOrderNo: match.buyLot.sourceTransaction.brokerOrderNo ?? null,
            note: match.buyLot.sourceTransaction.note ?? null,
            amount: sourceAmount,
            quantity: sourceQuantity,
            price: match.buyLot.sourceTransaction.price == null
              ? null
              : toNumber(match.buyLot.sourceTransaction.price),
            fee: toNumber(match.buyLot.sourceTransaction.fee),
            tax: toNumber(match.buyLot.sourceTransaction.tax),
            impliedUnitCost:
              sourceQuantity && sourceQuantity > 0 ? sourceAmount / sourceQuantity : null,
          },
        }
      }),
    }
  }
}
