import { Injectable, NotFoundException } from '@nestjs/common'
import { AssetType, TxType } from '@prisma/client'
import { OwnershipService } from '../common/services/ownership.service'
import { roundTo, toNumber } from '../common/utils/number.util'
import { PrismaService } from '../prisma.service'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto'
import {
  PortfolioHoldingTrendResponseDto,
  PortfolioTrendResponseDto,
} from './dto/portfolio-trend.response.dto'

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

type HistoricalTransactionRecord = {
  id: string
  accountId: string
  assetId: string
  type: TxType
  quantity: number
  amount: number
  price: number | null
  tradeTime: Date
}

type HistoricalPriceRecord = {
  assetId: string
  price: number
  asOf: Date
}

type OpenLot = {
  remainingQuantity: number
  unitCost: number
}

type TrendEvent =
  | {
      kind: 'transaction'
      timestamp: Date
      date: string
      transaction: HistoricalTransactionRecord
    }
  | {
      kind: 'price'
      timestamp: Date
      date: string
      price: HistoricalPriceRecord
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

  async getTrend(userId: string): Promise<PortfolioTrendResponseDto> {
    await this.ownershipService.validateUserExists(userId)

    const transactions = await this.prisma.transaction.findMany({
      where: {
        account: { userId },
        assetId: { not: null },
        type: { in: ['buy', 'sell'] },
        isDeleted: false,
      },
      orderBy: [
        { tradeTime: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        accountId: true,
        assetId: true,
        type: true,
        quantity: true,
        amount: true,
        price: true,
        tradeTime: true,
      },
    })

    if (transactions.length === 0) {
      return { points: [] }
    }

    const normalizedTransactions = transactions.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      assetId: transaction.assetId!,
      type: transaction.type,
      quantity: toNumber(transaction.quantity),
      amount: toNumber(transaction.amount),
      price: transaction.price == null ? null : toNumber(transaction.price),
      tradeTime: transaction.tradeTime,
    }))

    const assetIds = [...new Set(normalizedTransactions.map((transaction) => transaction.assetId))]
    const prices = await this.loadHistoricalPrices(assetIds)

    return {
      points: this.buildPortfolioTrendPoints(normalizedTransactions, prices),
    }
  }

  async getHoldingTrend(userId: string, assetId: string): Promise<PortfolioHoldingTrendResponseDto> {
    await this.ownershipService.validateUserExists(userId)

    const transactions = await this.prisma.transaction.findMany({
      where: {
        account: { userId },
        assetId,
        type: { in: ['buy', 'sell'] },
        isDeleted: false,
      },
      orderBy: [
        { tradeTime: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        accountId: true,
        assetId: true,
        type: true,
        quantity: true,
        amount: true,
        price: true,
        tradeTime: true,
      },
    })

    if (transactions.length === 0) {
      throw new NotFoundException('Asset holding not found')
    }

    const normalizedTransactions = transactions.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      assetId: transaction.assetId!,
      type: transaction.type,
      quantity: toNumber(transaction.quantity),
      amount: toNumber(transaction.amount),
      price: transaction.price == null ? null : toNumber(transaction.price),
      tradeTime: transaction.tradeTime,
    }))

    const prices = await this.loadHistoricalPrices([assetId])

    return {
      assetId,
      points: this.buildHoldingTrendPoints(assetId, normalizedTransactions, prices),
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

  private async loadHistoricalPrices(assetIds: string[]): Promise<HistoricalPriceRecord[]> {
    if (assetIds.length === 0) {
      return []
    }

    const prices = await this.prisma.price.findMany({
      where: {
        assetId: { in: assetIds },
      },
      orderBy: [
        { asOf: 'asc' },
        { id: 'asc' },
      ],
      select: {
        assetId: true,
        price: true,
        asOf: true,
      },
    })

    return prices.map((price) => ({
      assetId: price.assetId,
      price: toNumber(price.price),
      asOf: price.asOf,
    }))
  }

  private buildPortfolioTrendPoints(
    transactions: HistoricalTransactionRecord[],
    prices: HistoricalPriceRecord[],
  ): PortfolioTrendResponseDto['points'] {
    const timeline = this.buildTimelineEvents(transactions, prices)
    const openLotsByScope = new Map<string, OpenLot[]>()
    const latestPriceByAsset = new Map<string, number>()
    const points: PortfolioTrendResponseDto['points'] = []

    for (const date of this.extractTimelineDates(timeline)) {
      const dateEvents = timeline.filter((event) => event.date === date)

      for (const event of dateEvents) {
        if (event.kind === 'price') {
          latestPriceByAsset.set(event.price.assetId, event.price.price)
          continue
        }

        this.applyTransactionEvent(openLotsByScope, latestPriceByAsset, event.transaction)
      }

      const snapshot = this.snapshotPortfolio(openLotsByScope, latestPriceByAsset)
      points.push({
        label: date,
        date,
        investedCapital: roundTo(snapshot.investedCapital, 8),
        marketValue: roundTo(snapshot.marketValue, 8),
      })
    }

    return this.trimLeadingZeroPoints(points)
  }

  private buildHoldingTrendPoints(
    assetId: string,
    transactions: HistoricalTransactionRecord[],
    prices: HistoricalPriceRecord[],
  ): PortfolioHoldingTrendResponseDto['points'] {
    const timeline = this.buildTimelineEvents(transactions, prices)
    const openLotsByScope = new Map<string, OpenLot[]>()
    const latestPriceByAsset = new Map<string, number>()
    const points: PortfolioHoldingTrendResponseDto['points'] = []

    for (const date of this.extractTimelineDates(timeline)) {
      const dateEvents = timeline.filter((event) => event.date === date)

      for (const event of dateEvents) {
        if (event.kind === 'price') {
          latestPriceByAsset.set(event.price.assetId, event.price.price)
          continue
        }

        this.applyTransactionEvent(openLotsByScope, latestPriceByAsset, event.transaction)
      }

      const snapshot = this.snapshotAsset(assetId, openLotsByScope, latestPriceByAsset)
      points.push({
        label: date,
        date,
        investedAmount: roundTo(snapshot.investedAmount, 8),
        marketValue: roundTo(snapshot.marketValue, 8),
      })
    }

    return this.trimLeadingZeroPoints(points)
  }

  private buildTimelineEvents(
    transactions: HistoricalTransactionRecord[],
    prices: HistoricalPriceRecord[],
  ): TrendEvent[] {
    return [
      ...transactions.map((transaction) => ({
        kind: 'transaction' as const,
        timestamp: transaction.tradeTime,
        date: transaction.tradeTime.toISOString().slice(0, 10),
        transaction,
      })),
      ...prices.map((price) => ({
        kind: 'price' as const,
        timestamp: price.asOf,
        date: price.asOf.toISOString().slice(0, 10),
        price,
      })),
    ].sort((left, right) => {
      const timestampDiff = left.timestamp.getTime() - right.timestamp.getTime()
      if (timestampDiff !== 0) {
        return timestampDiff
      }

      if (left.kind === right.kind) {
        if (left.kind === 'transaction' && right.kind === 'transaction') {
          return left.transaction.id.localeCompare(right.transaction.id)
        }
        return 0
      }

      return left.kind === 'transaction' ? -1 : 1
    })
  }

  private extractTimelineDates(timeline: TrendEvent[]): string[] {
    return [...new Set(timeline.map((event) => event.date))]
  }

  private applyTransactionEvent(
    openLotsByScope: Map<string, OpenLot[]>,
    latestPriceByAsset: Map<string, number>,
    transaction: HistoricalTransactionRecord,
  ) {
    const scopeKey = `${transaction.accountId}:${transaction.assetId}`
    const scopeLots = openLotsByScope.get(scopeKey) ?? []

    if (transaction.price != null && transaction.price > 0) {
      latestPriceByAsset.set(transaction.assetId, transaction.price)
    }

    if (transaction.type === 'buy') {
      if (transaction.quantity <= 0 || transaction.amount <= 0) {
        return
      }

      scopeLots.push({
        remainingQuantity: transaction.quantity,
        unitCost: transaction.amount / transaction.quantity,
      })
      openLotsByScope.set(scopeKey, scopeLots)
      return
    }

    if (transaction.type !== 'sell' || transaction.quantity <= 0) {
      return
    }

    let remainingToSell = transaction.quantity
    for (const lot of scopeLots) {
      if (remainingToSell <= 1e-9) {
        break
      }

      if (lot.remainingQuantity <= 1e-9) {
        continue
      }

      const consumedQuantity = Math.min(lot.remainingQuantity, remainingToSell)
      lot.remainingQuantity -= consumedQuantity
      remainingToSell -= consumedQuantity
    }

    if (remainingToSell > 1e-9) {
      throw new NotFoundException('Historical holding lots are inconsistent')
    }

    openLotsByScope.set(scopeKey, scopeLots)
  }

  private snapshotPortfolio(
    openLotsByScope: Map<string, OpenLot[]>,
    latestPriceByAsset: Map<string, number>,
  ) {
    const holdingsByAsset = new Map<string, { quantity: number; investedAmount: number }>()

    for (const [scopeKey, lots] of openLotsByScope.entries()) {
      const [, assetId] = scopeKey.split(':')
      const holding = holdingsByAsset.get(assetId) ?? {
        quantity: 0,
        investedAmount: 0,
      }

      for (const lot of lots) {
        if (lot.remainingQuantity <= 1e-9) {
          continue
        }

        holding.quantity += lot.remainingQuantity
        holding.investedAmount += lot.remainingQuantity * lot.unitCost
      }

      holdingsByAsset.set(assetId, holding)
    }

    let investedCapital = 0
    let marketValue = 0

    for (const [assetId, holding] of holdingsByAsset.entries()) {
      investedCapital += holding.investedAmount
      const latestPrice = latestPriceByAsset.get(assetId)
      marketValue += latestPrice == null ? holding.investedAmount : holding.quantity * latestPrice
    }

    return { investedCapital, marketValue }
  }

  private snapshotAsset(
    assetId: string,
    openLotsByScope: Map<string, OpenLot[]>,
    latestPriceByAsset: Map<string, number>,
  ) {
    let quantity = 0
    let investedAmount = 0

    for (const [scopeKey, lots] of openLotsByScope.entries()) {
      const [, scopeAssetId] = scopeKey.split(':')
      if (scopeAssetId !== assetId) {
        continue
      }

      for (const lot of lots) {
        if (lot.remainingQuantity <= 1e-9) {
          continue
        }

        quantity += lot.remainingQuantity
        investedAmount += lot.remainingQuantity * lot.unitCost
      }
    }

    const latestPrice = latestPriceByAsset.get(assetId)
    const marketValue = latestPrice == null ? investedAmount : quantity * latestPrice

    return { investedAmount, marketValue }
  }

  private trimLeadingZeroPoints<T extends { investedCapital?: number; marketValue: number; investedAmount?: number }>(
    points: T[],
  ): T[] {
    const firstMeaningfulIndex = points.findIndex((point) => {
      const investedValue = point.investedCapital ?? point.investedAmount ?? 0
      return investedValue > 1e-9 || point.marketValue > 1e-9
    })

    if (firstMeaningfulIndex === -1) {
      return points
    }

    return points.slice(firstMeaningfulIndex)
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
