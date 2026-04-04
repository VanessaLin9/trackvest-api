import { Injectable } from '@nestjs/common'
import { AssetType, TxType } from '@prisma/client'
import { OwnershipService } from '../common/services/ownership.service'
import { roundTo, toNumber } from '../common/utils/number.util'
import { PrismaService } from '../prisma.service'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto'

type HoldingActivityRecord = {
  assetId: string | null
  type: TxType
  tradeTime: Date
  note: string | null
}

type HoldingOverviewItem = PortfolioHoldingsResponseDto['items'][number]

type HoldingsSnapshot = {
  asOf: string
  baseCurrency: string | null
  items: HoldingOverviewItem[]
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownershipService: OwnershipService,
  ) {}

  async getSummary(userId: string): Promise<PortfolioSummaryResponseDto> {
    const snapshot = await this.buildHoldingsSnapshot(userId)
    const investedCapital = snapshot.items.reduce((sum, item) => sum + item.investedAmount, 0)
    const marketValue = snapshot.items.reduce((sum, item) => sum + item.marketValue, 0)
    const totalPnl = marketValue - investedCapital

    return {
      asOf: snapshot.asOf,
      baseCurrency: snapshot.baseCurrency,
      investedCapital: roundTo(investedCapital, 8),
      marketValue: roundTo(marketValue, 8),
      totalPnl: roundTo(totalPnl, 8),
      totalReturnRate: investedCapital > 0 ? roundTo(totalPnl / investedCapital, 8) : 0,
      holdingsCount: snapshot.items.length,
    }
  }

  async getHoldings(userId: string): Promise<PortfolioHoldingsResponseDto> {
    const snapshot = await this.buildHoldingsSnapshot(userId)
    const totalMarketValue = snapshot.items.reduce((sum, item) => sum + item.marketValue, 0)
    const allocationByTypeMap = new Map<AssetType, number>()

    for (const item of snapshot.items) {
      allocationByTypeMap.set(item.type, (allocationByTypeMap.get(item.type) ?? 0) + item.marketValue)
    }

    return {
      items: snapshot.items,
      allocationByType: [...allocationByTypeMap.entries()]
        .map(([type, marketValue]) => ({
          type,
          marketValue: roundTo(marketValue, 8),
          weight: totalMarketValue > 0 ? roundTo(marketValue / totalMarketValue, 8) : 0,
        }))
        .sort((left, right) => right.marketValue - left.marketValue || left.type.localeCompare(right.type)),
    }
  }

  private async buildHoldingsSnapshot(userId: string): Promise<HoldingsSnapshot> {
    await this.ownershipService.validateUserExists(userId)

    const positions = await this.prisma.position.findMany({
      where: {
        account: { userId },
        closedAt: null,
        quantity: { gt: 0 },
      },
      include: {
        account: {
          select: {
            currency: true,
          },
        },
        asset: {
          select: {
            id: true,
            symbol: true,
            name: true,
            type: true,
            baseCurrency: true,
          },
        },
      },
      orderBy: [
        { assetId: 'asc' },
        { openedAt: 'asc' },
      ],
    })

    if (positions.length === 0) {
      return {
        asOf: new Date().toISOString(),
        baseCurrency: null,
        items: [],
      }
    }

    const assetIds = [...new Set(positions.map((position) => position.assetId))]
    const [prices, activities] = await Promise.all([
      this.prisma.price.findMany({
        where: {
          assetId: { in: assetIds },
        },
        orderBy: [
          { assetId: 'asc' },
          { asOf: 'desc' },
        ],
      }),
      this.prisma.transaction.findMany({
        where: {
          account: { userId },
          assetId: { in: assetIds },
          isDeleted: false,
        },
        orderBy: [
          { tradeTime: 'desc' },
          { id: 'desc' },
        ],
        select: {
          assetId: true,
          type: true,
          tradeTime: true,
          note: true,
        },
      }),
    ])

    const latestPriceByAssetId = new Map<string, { price: number; asOf: Date }>()
    for (const price of prices) {
      if (!latestPriceByAssetId.has(price.assetId)) {
        latestPriceByAssetId.set(price.assetId, {
          price: toNumber(price.price),
          asOf: price.asOf,
        })
      }
    }

    const lastActivityByAssetId = new Map<string, HoldingActivityRecord>()
    for (const activity of activities) {
      if (activity.assetId && !lastActivityByAssetId.has(activity.assetId)) {
        lastActivityByAssetId.set(activity.assetId, activity)
      }
    }

    const groupedHoldings = new Map<
      string,
      {
        assetId: string
        symbol: string
        name: string
        type: AssetType
        quantity: number
        investedAmount: number
      }
    >()

    for (const position of positions) {
      const quantity = toNumber(position.quantity)
      const avgCost = toNumber(position.avgCost)
      const investedAmount = quantity * avgCost
      const existing = groupedHoldings.get(position.assetId)

      if (!existing) {
        groupedHoldings.set(position.assetId, {
          assetId: position.assetId,
          symbol: position.asset.symbol,
          name: position.asset.name,
          type: position.asset.type,
          quantity,
          investedAmount,
        })
        continue
      }

      existing.quantity += quantity
      existing.investedAmount += investedAmount
    }

    const items = [...groupedHoldings.values()]
      .map((holding) => {
        const latestPriceRecord = latestPriceByAssetId.get(holding.assetId)
        const avgCost = holding.quantity > 0 ? holding.investedAmount / holding.quantity : 0
        const latestPrice = latestPriceRecord?.price ?? null
        const marketValue =
          latestPrice == null ? holding.investedAmount : holding.quantity * latestPrice
        const pnl = marketValue - holding.investedAmount

        return {
          assetId: holding.assetId,
          symbol: holding.symbol,
          name: holding.name,
          type: holding.type,
          quantity: roundTo(holding.quantity, 8),
          avgCost: roundTo(avgCost, 8),
          latestPrice: latestPrice == null ? null : roundTo(latestPrice, 8),
          investedAmount: roundTo(holding.investedAmount, 8),
          marketValue: roundTo(marketValue, 8),
          pnl: roundTo(pnl, 8),
          returnRate: holding.investedAmount > 0 ? roundTo(pnl / holding.investedAmount, 8) : 0,
          weight: 0,
          lastActivitySummary: this.formatLastActivitySummary(
            lastActivityByAssetId.get(holding.assetId) ?? null,
          ),
        }
      })
      .sort((left, right) => right.marketValue - left.marketValue || left.symbol.localeCompare(right.symbol))

    const totalMarketValue = items.reduce((sum, item) => sum + item.marketValue, 0)
    const weightedItems = items.map((item) => ({
      ...item,
      weight: totalMarketValue > 0 ? roundTo(item.marketValue / totalMarketValue, 8) : 0,
    }))

    const latestAsOf = [...latestPriceByAssetId.values()].reduce<Date | null>(
      (currentLatest, record) => {
        if (!currentLatest || record.asOf > currentLatest) {
          return record.asOf
        }
        return currentLatest
      },
      null,
    )

    return {
      asOf: (latestAsOf ?? new Date()).toISOString(),
      baseCurrency: this.getSingleCurrency(positions.map((position) => position.account.currency)),
      items: weightedItems,
    }
  }

  private getSingleCurrency(values: Array<string | null | undefined>): string | null {
    const unique = [...new Set(values.filter((value): value is string => Boolean(value)))]

    if (unique.length === 1) {
      return unique[0]
    }

    return unique.length === 0 ? null : 'MIXED'
  }

  private formatLastActivitySummary(activity: HoldingActivityRecord | null): string | null {
    if (!activity) {
      return null
    }

    const note = activity.note?.trim()
    if (note) {
      return note
    }

    return `${this.getActivityLabel(activity.type)} on ${activity.tradeTime.toISOString().slice(0, 10)}`
  }

  private getActivityLabel(type: TxType): string {
    switch (type) {
      case 'buy':
        return 'Buy'
      case 'sell':
        return 'Sell'
      case 'dividend':
        return 'Dividend'
      case 'fee':
        return 'Fee'
      case 'deposit':
        return 'Deposit'
      case 'withdraw':
        return 'Withdraw'
    }
  }
}
