import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AssetClass, AssetType, TxType } from '@prisma/client'
import { OwnershipService } from '../common/services/ownership.service'
import { roundTo, toNumber } from '../common/utils/number.util'
import { PrismaService } from '../prisma.service'
import { GetPortfolioDisplayCurrencyDto } from './dto/get-portfolio-display-currency.dto'
import { GetPortfolioRebalanceDto } from './dto/get-portfolio-rebalance.dto'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'
import { PortfolioRebalanceResponseDto } from './dto/portfolio-rebalance.response.dto'
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto'
import {
  PortfolioHoldingTrendResponseDto,
  PortfolioTrendResponseDto,
} from './dto/portfolio-trend.response.dto'
import {
  HoldingOverviewItem,
  PortfolioHoldingsSnapshotService,
  ValuationFxContext,
} from './portfolio-holdings-snapshot.service'

type RebalanceTrackedAssetClass = 'equity' | 'bond'

const DEFAULT_REBALANCE_TARGETS: Record<RebalanceTrackedAssetClass, number> = {
  equity: 0.8,
  bond: 0.2,
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
    private readonly holdingsSnapshotService: PortfolioHoldingsSnapshotService,
  ) {}

  async getSummary(
    userId: string,
    query?: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioSummaryResponseDto> {
    const snapshot = await this.holdingsSnapshotService.buildSnapshot(userId, query)
    const investedCapital = snapshot.items.reduce((sum, item) => sum + item.investedAmount, 0)
    const marketValue = snapshot.items.reduce((sum, item) => sum + item.marketValue, 0)
    const totalPnl = marketValue - investedCapital

    return {
      asOf: snapshot.asOf,
      displayCurrencyMode: snapshot.displayCurrencyMode,
      requestedDisplayCurrency: snapshot.requestedDisplayCurrency,
      effectiveDisplayCurrency: snapshot.effectiveDisplayCurrency,
      baseCurrency: snapshot.baseCurrency,
      investedCapital: roundTo(investedCapital, 8),
      marketValue: roundTo(marketValue, 8),
      totalPnl: roundTo(totalPnl, 8),
      totalReturnRate: investedCapital > 0 ? roundTo(totalPnl / investedCapital, 8) : 0,
      holdingsCount: snapshot.items.length,
    }
  }

  async getHoldings(
    userId: string,
    query?: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioHoldingsResponseDto> {
    const snapshot = await this.holdingsSnapshotService.buildSnapshot(userId, query)
    const totalMarketValue = snapshot.items.reduce((sum, item) => sum + item.marketValue, 0)
    const allocationByTypeMap = new Map<AssetType, number>()
    const allocationByAssetClassMap = new Map<AssetClass, number>()

    for (const item of snapshot.items) {
      allocationByTypeMap.set(item.type, (allocationByTypeMap.get(item.type) ?? 0) + item.marketValue)
      allocationByAssetClassMap.set(
        item.assetClass,
        (allocationByAssetClassMap.get(item.assetClass) ?? 0) + item.marketValue,
      )
    }

    return {
      displayCurrencyMode: snapshot.displayCurrencyMode,
      requestedDisplayCurrency: snapshot.requestedDisplayCurrency,
      effectiveDisplayCurrency: snapshot.effectiveDisplayCurrency,
      items: snapshot.items,
      allocationByType: [...allocationByTypeMap.entries()]
        .map(([type, marketValue]) => ({
          type,
          marketValue: roundTo(marketValue, 8),
          weight: totalMarketValue > 0 ? roundTo(marketValue / totalMarketValue, 8) : 0,
        }))
        .sort((left, right) => right.marketValue - left.marketValue || left.type.localeCompare(right.type)),
      allocationByAssetClass: [...allocationByAssetClassMap.entries()]
        .map(([assetClass, marketValue]) => ({
          assetClass,
          marketValue: roundTo(marketValue, 8),
          weight: totalMarketValue > 0 ? roundTo(marketValue / totalMarketValue, 8) : 0,
        }))
        .sort(
          (left, right) =>
            right.marketValue - left.marketValue || left.assetClass.localeCompare(right.assetClass),
        ),
    }
  }

  async getRebalance(
    userId: string,
    query?: GetPortfolioRebalanceDto,
  ): Promise<PortfolioRebalanceResponseDto> {
    const snapshot = await this.holdingsSnapshotService.buildSnapshot(userId, query)
    const targets = this.resolveRebalanceTargets(query)
    const marketValueByAssetClass = this.sumTrackedAssetClassMarketValues(snapshot.items)
    const trackedMarketValue = marketValueByAssetClass.equity + marketValueByAssetClass.bond
    const current = trackedMarketValue > 0
      ? {
          equity: roundTo(marketValueByAssetClass.equity / trackedMarketValue, 8),
          bond: roundTo(marketValueByAssetClass.bond / trackedMarketValue, 8),
        }
      : {
          equity: 0,
          bond: 0,
        }

    const gaps = {
      equity: roundTo(targets.equity - current.equity, 8),
      bond: roundTo(targets.bond - current.bond, 8),
    }

    const recommendedBuyAmountByAssetClass = trackedMarketValue > 0
      ? {
          equity: roundTo(
            this.calculateRecommendedBuyAmount({
              targetWeight: targets.equity,
              currentWeight: current.equity,
              currentMarketValue: marketValueByAssetClass.equity,
              trackedMarketValue,
            }),
            8,
          ),
          bond: roundTo(
            this.calculateRecommendedBuyAmount({
              targetWeight: targets.bond,
              currentWeight: current.bond,
              currentMarketValue: marketValueByAssetClass.bond,
              trackedMarketValue,
            }),
            8,
          ),
        }
      : {
          equity: 0,
          bond: 0,
        }

    const candidates = this.buildRebalanceCandidates(snapshot.items)
    const suggestions = this.buildRebalanceSuggestions(snapshot.items, recommendedBuyAmountByAssetClass)

    return {
      asOf: snapshot.asOf,
      displayCurrencyMode: snapshot.displayCurrencyMode,
      requestedDisplayCurrency: snapshot.requestedDisplayCurrency,
      effectiveDisplayCurrency: snapshot.effectiveDisplayCurrency,
      baseCurrency: snapshot.baseCurrency,
      targets,
      current,
      gaps,
      marketValueByAssetClass: {
        equity: roundTo(marketValueByAssetClass.equity, 8),
        bond: roundTo(marketValueByAssetClass.bond, 8),
      },
      recommendedBuyAmountByAssetClass,
      trackedMarketValue: roundTo(trackedMarketValue, 8),
      candidates,
      suggestions,
      notes: this.buildRebalanceNotes(snapshot.items, trackedMarketValue, suggestions),
    }
  }

  async getTrend(
    userId: string,
    query?: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioTrendResponseDto> {
    await this.ownershipService.validateUserExists(userId)
    const requestedDisplayCurrency = this.holdingsSnapshotService.getRequestedDisplayCurrency(query)
    const displayCurrencyMode = this.holdingsSnapshotService.getDisplayCurrencyMode(query)

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
      return {
        displayCurrencyMode,
        requestedDisplayCurrency,
        effectiveDisplayCurrency: requestedDisplayCurrency,
        points: [],
      }
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
    const [prices, accounts, assets] = await Promise.all([
      this.loadHistoricalPrices(assetIds),
      this.prisma.account.findMany({
        where: {
          userId,
          id: { in: [...new Set(normalizedTransactions.map((transaction) => transaction.accountId))] },
        },
        select: {
          id: true,
          currency: true,
        },
      }),
      this.prisma.asset.findMany({
        where: {
          id: { in: assetIds },
        },
        select: {
          id: true,
          baseCurrency: true,
        },
      }),
    ])
    const displayCurrencyContext = this.holdingsSnapshotService.resolveDisplayCurrencyContext(
      accounts.map((account) => account.currency),
      query,
    )
    const timeline = this.buildTimelineEvents(normalizedTransactions, prices)
    const fxContextByDate = await this.holdingsSnapshotService.buildFxContextsByDate({
      dates: this.extractTimelineDates(timeline),
      portfolioBaseCurrency: displayCurrencyContext.effectiveDisplayCurrency,
      sourceCurrencies: [
        ...accounts.map((account) => account.currency),
        ...assets.map((asset) => asset.baseCurrency),
      ],
    })
    const accountCurrencyById = new Map(accounts.map((account) => [account.id, account.currency]))
    const assetCurrencyById = new Map(assets.map((asset) => [asset.id, asset.baseCurrency]))

    return {
      displayCurrencyMode: displayCurrencyContext.displayCurrencyMode,
      requestedDisplayCurrency: displayCurrencyContext.requestedDisplayCurrency,
      effectiveDisplayCurrency: displayCurrencyContext.effectiveDisplayCurrency,
      points: this.buildPortfolioTrendPoints(
        timeline,
        accountCurrencyById,
        assetCurrencyById,
        fxContextByDate,
      ),
    }
  }

  async getHoldingTrend(
    userId: string,
    assetId: string,
    query?: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioHoldingTrendResponseDto> {
    await this.ownershipService.validateUserExists(userId)
    const requestedDisplayCurrency = this.holdingsSnapshotService.getRequestedDisplayCurrency(query)
    const displayCurrencyMode = this.holdingsSnapshotService.getDisplayCurrencyMode(query)

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

    const [prices, accounts, asset] = await Promise.all([
      this.loadHistoricalPrices([assetId]),
      this.prisma.account.findMany({
        where: {
          userId,
          id: { in: [...new Set(normalizedTransactions.map((transaction) => transaction.accountId))] },
        },
        select: {
          id: true,
          currency: true,
        },
      }),
      this.prisma.asset.findUnique({
        where: { id: assetId },
        select: {
          id: true,
          baseCurrency: true,
        },
      }),
    ])
    const displayCurrencyContext = this.holdingsSnapshotService.resolveDisplayCurrencyContext(
      accounts.map((account) => account.currency),
      query,
    )
    const timeline = this.buildTimelineEvents(normalizedTransactions, prices)
    const fxContextByDate = await this.holdingsSnapshotService.buildFxContextsByDate({
      dates: this.extractTimelineDates(timeline),
      portfolioBaseCurrency: displayCurrencyContext.effectiveDisplayCurrency,
      sourceCurrencies: [
        ...accounts.map((account) => account.currency),
        asset?.baseCurrency ?? displayCurrencyContext.effectiveDisplayCurrency,
      ],
    })
    const accountCurrencyById = new Map(accounts.map((account) => [account.id, account.currency]))

    return {
      assetId,
      displayCurrencyMode: requestedDisplayCurrency ? 'preferred-base' : displayCurrencyMode,
      requestedDisplayCurrency,
      effectiveDisplayCurrency: displayCurrencyContext.effectiveDisplayCurrency,
      points: this.buildHoldingTrendPoints(
        assetId,
        timeline,
        accountCurrencyById,
        asset?.baseCurrency ?? displayCurrencyContext.effectiveDisplayCurrency,
        fxContextByDate,
      ),
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

  private sumTrackedAssetClassMarketValues(items: HoldingOverviewItem[]) {
    return items.reduce(
      (totals, item) => {
        if (item.assetClass === 'equity' || item.assetClass === 'bond') {
          totals[item.assetClass] += item.marketValue
        }

        return totals
      },
      { equity: 0, bond: 0 },
    )
  }

  private resolveRebalanceTargets(
    query?: Pick<GetPortfolioRebalanceDto, 'targetEquity' | 'targetBond'>,
  ): Record<RebalanceTrackedAssetClass, number> {
    const targetEquity = query?.targetEquity
    const targetBond = query?.targetBond

    if (targetEquity == null && targetBond == null) {
      return DEFAULT_REBALANCE_TARGETS
    }

    if (targetEquity != null && targetBond == null) {
      return {
        equity: roundTo(targetEquity, 8),
        bond: roundTo(1 - targetEquity, 8),
      }
    }

    if (targetEquity == null && targetBond != null) {
      return {
        equity: roundTo(1 - targetBond, 8),
        bond: roundTo(targetBond, 8),
      }
    }

    const total = (targetEquity ?? 0) + (targetBond ?? 0)
    if (Math.abs(total - 1) > 1e-8) {
      throw new BadRequestException('targetEquity and targetBond must sum to 1')
    }

    return {
      equity: roundTo(targetEquity ?? DEFAULT_REBALANCE_TARGETS.equity, 8),
      bond: roundTo(targetBond ?? DEFAULT_REBALANCE_TARGETS.bond, 8),
    }
  }

  private calculateRecommendedBuyAmount(input: {
    targetWeight: number
    currentWeight: number
    currentMarketValue: number
    trackedMarketValue: number
  }) {
    if (input.currentWeight >= input.targetWeight || input.targetWeight >= 1) {
      return 0
    }

    return Math.max(
      0,
      (input.targetWeight * input.trackedMarketValue - input.currentMarketValue) / (1 - input.targetWeight),
    )
  }

  private buildRebalanceSuggestions(
    items: HoldingOverviewItem[],
    recommendedBuyAmountByAssetClass: Record<RebalanceTrackedAssetClass, number>,
  ): PortfolioRebalanceResponseDto['suggestions'] {
    const suggestions: PortfolioRebalanceResponseDto['suggestions'] = []

    for (const assetClass of ['equity', 'bond'] as const) {
      const totalRecommendedBuyAmount = recommendedBuyAmountByAssetClass[assetClass]
      if (totalRecommendedBuyAmount <= 1e-9) {
        continue
      }

      const classItems = items.filter((item) => item.assetClass === assetClass)
      const classMarketValue = classItems.reduce((sum, item) => sum + item.marketValue, 0)

      if (classItems.length === 0 || classMarketValue <= 1e-9) {
        continue
      }

      for (const item of classItems) {
        const currentWeightWithinAssetClass = item.marketValue / classMarketValue
        const suggestedBuyAmount = totalRecommendedBuyAmount * currentWeightWithinAssetClass
        suggestions.push({
          assetClass,
          assetId: item.assetId,
          symbol: item.symbol,
          name: item.name,
          currentMarketValue: roundTo(item.marketValue, 8),
          currentWeightWithinAssetClass: roundTo(currentWeightWithinAssetClass, 8),
          suggestedBuyAmount: roundTo(suggestedBuyAmount, 8),
          estimatedQuantity:
            item.latestPrice != null && item.latestPrice > 0
              ? roundTo(suggestedBuyAmount / item.latestPrice, 8)
              : null,
          latestPrice: item.latestPrice == null ? null : roundTo(item.latestPrice, 8),
          latestPriceCurrency: item.latestPriceCurrency,
        })
      }
    }

    return suggestions.sort(
      (left, right) =>
        right.suggestedBuyAmount - left.suggestedBuyAmount || left.symbol.localeCompare(right.symbol),
    )
  }

  private buildRebalanceCandidates(
    items: HoldingOverviewItem[],
  ): PortfolioRebalanceResponseDto['candidates'] {
    const candidates: PortfolioRebalanceResponseDto['candidates'] = []

    for (const assetClass of ['equity', 'bond'] as const) {
      const classItems = items.filter((item) => item.assetClass === assetClass)
      const classMarketValue = classItems.reduce((sum, item) => sum + item.marketValue, 0)

      if (classItems.length === 0 || classMarketValue <= 1e-9) {
        continue
      }

      for (const item of classItems) {
        candidates.push({
          assetClass,
          assetId: item.assetId,
          symbol: item.symbol,
          name: item.name,
          currentMarketValue: roundTo(item.marketValue, 8),
          currentWeightWithinAssetClass: roundTo(item.marketValue / classMarketValue, 8),
          latestPrice: item.latestPrice == null ? null : roundTo(item.latestPrice, 8),
          latestPriceCurrency: item.latestPriceCurrency,
          assetBaseCurrency: item.assetBaseCurrency,
          lotSize: null,
          minTradeUnit: null,
        })
      }
    }

    return candidates.sort(
      (left, right) =>
        left.assetClass.localeCompare(right.assetClass)
        || right.currentMarketValue - left.currentMarketValue
        || left.symbol.localeCompare(right.symbol),
    )
  }

  private buildRebalanceNotes(
    items: HoldingOverviewItem[],
    trackedMarketValue: number,
    suggestions: PortfolioRebalanceResponseDto['suggestions'],
  ): string[] {
    const notes: string[] = []
    const excludedAssetClasses = [...new Set(
      items
        .map((item) => item.assetClass)
        .filter((assetClass) => assetClass !== 'equity' && assetClass !== 'bond'),
    )]

    if (trackedMarketValue <= 0) {
      notes.push('No equity or bond holdings are available for rebalance calculations yet.')
    }

    if (excludedAssetClasses.length > 0) {
      notes.push(
        `Current ratios are calculated from equity and bond holdings only. Excluded asset classes: ${excludedAssetClasses.join(', ')}.`,
      )
    }

    notes.push('Recommended buy amounts assume a buy-only rebalance and do not suggest selling.')

    if (suggestions.length > 0) {
      notes.push('Suggestions are distributed across existing holdings based on current market value within each asset class.')
      notes.push('Estimated quantities are approximate and do not account for broker lot-size constraints.')
    }

    return notes
  }

  private buildPortfolioTrendPoints(
    timeline: TrendEvent[],
    accountCurrencyById: Map<string, string>,
    assetCurrencyById: Map<string, string>,
    fxContextByDate: Map<string, ValuationFxContext>,
  ): PortfolioTrendResponseDto['points'] {
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

      const fxContext = fxContextByDate.get(date)
      if (!fxContext) {
        throw new NotFoundException(`FX context not found for trend date ${date}`)
      }

      const snapshot = this.snapshotPortfolio(
        openLotsByScope,
        latestPriceByAsset,
        accountCurrencyById,
        assetCurrencyById,
        fxContext,
      )
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
    timeline: TrendEvent[],
    accountCurrencyById: Map<string, string>,
    assetBaseCurrency: string,
    fxContextByDate: Map<string, ValuationFxContext>,
  ): PortfolioHoldingTrendResponseDto['points'] {
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

      const fxContext = fxContextByDate.get(date)
      if (!fxContext) {
        throw new NotFoundException(`FX context not found for trend date ${date}`)
      }

      const snapshot = this.snapshotAsset(
        assetId,
        openLotsByScope,
        latestPriceByAsset,
        accountCurrencyById,
        assetBaseCurrency,
        fxContext,
      )
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
      const dateDiff = left.date.localeCompare(right.date)
      if (dateDiff !== 0) {
        return dateDiff
      }

      if (left.kind !== right.kind) {
        return left.kind === 'transaction' ? -1 : 1
      }

      const timestampDiff = left.timestamp.getTime() - right.timestamp.getTime()
      if (timestampDiff !== 0) {
        return timestampDiff
      }

      if (left.kind === 'transaction' && right.kind === 'transaction') {
        return left.transaction.id.localeCompare(right.transaction.id)
      }

      if (left.kind === 'price' && right.kind === 'price') {
        return left.price.assetId.localeCompare(right.price.assetId)
      }

      return 0
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
    accountCurrencyById: Map<string, string>,
    assetCurrencyById: Map<string, string>,
    fxContext: ValuationFxContext,
  ) {
    const holdingsByAsset = new Map<string, { quantity: number; investedAmount: number }>()

    for (const [scopeKey, lots] of openLotsByScope.entries()) {
      const [accountId, assetId] = scopeKey.split(':')
      const holding = holdingsByAsset.get(assetId) ?? {
        quantity: 0,
        investedAmount: 0,
      }
      const accountCurrency = accountCurrencyById.get(accountId) ?? fxContext.portfolioBaseCurrency

      for (const lot of lots) {
        if (lot.remainingQuantity <= 1e-9) {
          continue
        }

        holding.quantity += lot.remainingQuantity
        holding.investedAmount += this.holdingsSnapshotService.convertAmount(
          lot.remainingQuantity * lot.unitCost,
          accountCurrency,
          fxContext,
        )
      }

      holdingsByAsset.set(assetId, holding)
    }

    let investedCapital = 0
    let marketValue = 0

    for (const [assetId, holding] of holdingsByAsset.entries()) {
      investedCapital += holding.investedAmount
      const latestPrice = latestPriceByAsset.get(assetId)
      const assetCurrency = assetCurrencyById.get(assetId) ?? fxContext.portfolioBaseCurrency
      marketValue += latestPrice == null
        ? holding.investedAmount
        : this.holdingsSnapshotService.convertAmount(holding.quantity * latestPrice, assetCurrency, fxContext)
    }

    return { investedCapital, marketValue }
  }

  private snapshotAsset(
    assetId: string,
    openLotsByScope: Map<string, OpenLot[]>,
    latestPriceByAsset: Map<string, number>,
    accountCurrencyById: Map<string, string>,
    assetBaseCurrency: string,
    fxContext: ValuationFxContext,
  ) {
    let quantity = 0
    let investedAmount = 0

    for (const [scopeKey, lots] of openLotsByScope.entries()) {
      const [accountId, scopeAssetId] = scopeKey.split(':')
      if (scopeAssetId !== assetId) {
        continue
      }
      const accountCurrency = accountCurrencyById.get(accountId) ?? fxContext.portfolioBaseCurrency

      for (const lot of lots) {
        if (lot.remainingQuantity <= 1e-9) {
          continue
        }

        quantity += lot.remainingQuantity
        investedAmount += this.holdingsSnapshotService.convertAmount(
          lot.remainingQuantity * lot.unitCost,
          accountCurrency,
          fxContext,
        )
      }
    }

    const latestPrice = latestPriceByAsset.get(assetId)
    const marketValue = latestPrice == null
      ? investedAmount
      : this.holdingsSnapshotService.convertAmount(quantity * latestPrice, assetBaseCurrency, fxContext)

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
}
