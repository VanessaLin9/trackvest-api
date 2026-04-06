import { Injectable, NotFoundException } from '@nestjs/common'
import { AssetType, TxType } from '@prisma/client'
import { APP_CURRENCIES } from '../common/constants/currency.constants'
import { OwnershipService } from '../common/services/ownership.service'
import { roundTo, toNumber } from '../common/utils/number.util'
import { FxRateService } from '../fx/fx-rate.service'
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

type ValuationFxContext = {
  portfolioBaseCurrency: string
  rates: Map<string, number>
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
    private readonly fxRateService: FxRateService,
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
    const portfolioBaseCurrency = this.getPortfolioBaseCurrency(accounts.map((account) => account.currency))
    const fxContext = await this.buildFxContext({
      portfolioBaseCurrency,
      sourceCurrencies: [
        ...accounts.map((account) => account.currency),
        ...assets.map((asset) => asset.baseCurrency),
      ],
      asOf: this.getLatestDateFromHistory(
        normalizedTransactions.map((transaction) => transaction.tradeTime),
        prices.map((price) => price.asOf),
      ),
    })
    const accountCurrencyById = new Map(accounts.map((account) => [account.id, account.currency]))
    const assetCurrencyById = new Map(assets.map((asset) => [asset.id, asset.baseCurrency]))

    return {
      points: this.buildPortfolioTrendPoints(
        normalizedTransactions,
        prices,
        accountCurrencyById,
        assetCurrencyById,
        fxContext,
      ),
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
    const portfolioBaseCurrency = this.getPortfolioBaseCurrency(accounts.map((account) => account.currency))
    const fxContext = await this.buildFxContext({
      portfolioBaseCurrency,
      sourceCurrencies: [
        ...accounts.map((account) => account.currency),
        asset?.baseCurrency ?? portfolioBaseCurrency,
      ],
      asOf: this.getLatestDateFromHistory(
        normalizedTransactions.map((transaction) => transaction.tradeTime),
        prices.map((price) => price.asOf),
      ),
    })
    const accountCurrencyById = new Map(accounts.map((account) => [account.id, account.currency]))

    return {
      assetId,
      points: this.buildHoldingTrendPoints(
        assetId,
        normalizedTransactions,
        prices,
        accountCurrencyById,
        asset?.baseCurrency ?? portfolioBaseCurrency,
        fxContext,
      ),
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
    const portfolioBaseCurrency = this.getPortfolioBaseCurrency(
      positions.map((position) => position.account.currency),
    )
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

    const latestAsOf = [...latestPriceByAssetId.values()].reduce<Date | null>(
      (currentLatest, record) => {
        if (!currentLatest || record.asOf > currentLatest) {
          return record.asOf
        }
        return currentLatest
      },
      null,
    )
    const valuationAsOf = latestAsOf ?? new Date()
    const fxContext = await this.buildFxContext({
      portfolioBaseCurrency,
      sourceCurrencies: [
        ...positions.map((position) => position.account.currency),
        ...positions.map((position) => position.asset.baseCurrency),
      ],
      asOf: valuationAsOf,
    })

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
        accountCurrency: string
        assetCurrency: string
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
          accountCurrency: position.account.currency,
          assetCurrency: position.asset.baseCurrency,
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
        const sourceInvestedAmount = holding.investedAmount
        const convertedInvestedAmount = this.convertAmount(
          sourceInvestedAmount,
          holding.accountCurrency,
          fxContext,
        )
        const sourceMarketValue =
          latestPrice == null ? sourceInvestedAmount : holding.quantity * latestPrice
        const convertedMarketValue = this.convertAmount(
          sourceMarketValue,
          holding.assetCurrency,
          fxContext,
        )
        const pnl = convertedMarketValue - convertedInvestedAmount

        return {
          assetId: holding.assetId,
          symbol: holding.symbol,
          name: holding.name,
          type: holding.type,
          quantity: roundTo(holding.quantity, 8),
          avgCost: roundTo(this.convertAmount(avgCost, holding.accountCurrency, fxContext), 8),
          latestPrice: latestPrice == null ? null : roundTo(latestPrice, 8),
          investedAmount: roundTo(convertedInvestedAmount, 8),
          marketValue: roundTo(convertedMarketValue, 8),
          pnl: roundTo(pnl, 8),
          returnRate: convertedInvestedAmount > 0 ? roundTo(pnl / convertedInvestedAmount, 8) : 0,
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

    return {
      asOf: valuationAsOf.toISOString(),
      baseCurrency: portfolioBaseCurrency,
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
    accountCurrencyById: Map<string, string>,
    assetCurrencyById: Map<string, string>,
    fxContext: ValuationFxContext,
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
    transactions: HistoricalTransactionRecord[],
    prices: HistoricalPriceRecord[],
    accountCurrencyById: Map<string, string>,
    assetBaseCurrency: string,
    fxContext: ValuationFxContext,
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
        holding.investedAmount += this.convertAmount(
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
        : this.convertAmount(holding.quantity * latestPrice, assetCurrency, fxContext)
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
        investedAmount += this.convertAmount(
          lot.remainingQuantity * lot.unitCost,
          accountCurrency,
          fxContext,
        )
      }
    }

    const latestPrice = latestPriceByAsset.get(assetId)
    const marketValue = latestPrice == null
      ? investedAmount
      : this.convertAmount(quantity * latestPrice, assetBaseCurrency, fxContext)

    return { investedAmount, marketValue }
  }

  private async buildFxContext(input: {
    portfolioBaseCurrency: string
    sourceCurrencies: string[]
    asOf: Date
  }): Promise<ValuationFxContext> {
    const portfolioBaseCurrency = input.portfolioBaseCurrency.toUpperCase()
    const sourceCurrencies = [...new Set(input.sourceCurrencies.map((currency) => currency.toUpperCase()))]
    const rates = new Map<string, number>([[portfolioBaseCurrency, 1]])

    for (const currency of sourceCurrencies) {
      if (currency === portfolioBaseCurrency) {
        continue
      }

      const fxRate = await this.fxRateService.getReferenceRate({
        base: currency,
        quote: portfolioBaseCurrency,
        asOf: input.asOf,
      })
      rates.set(currency, fxRate.rate)
    }

    return {
      portfolioBaseCurrency,
      rates,
    }
  }

  private convertAmount(amount: number, sourceCurrency: string, fxContext: ValuationFxContext): number {
    const normalizedSourceCurrency = sourceCurrency.toUpperCase()
    if (normalizedSourceCurrency === fxContext.portfolioBaseCurrency) {
      return amount
    }

    const rate = fxContext.rates.get(normalizedSourceCurrency)
    if (rate == null) {
      throw new NotFoundException(
        `FX rate not found for ${normalizedSourceCurrency}/${fxContext.portfolioBaseCurrency}`,
      )
    }

    return amount * rate
  }

  private getPortfolioBaseCurrency(currencies: string[]): string {
    const singleCurrency = this.getSingleCurrency(currencies)
    if (singleCurrency && singleCurrency !== 'MIXED') {
      return singleCurrency
    }

    return APP_CURRENCIES.includes('USD') ? 'USD' : currencies[0] ?? 'USD'
  }

  private getLatestDateFromHistory(primaryDates: Date[], fallbackDates: Date[]): Date {
    const allDates = [...primaryDates, ...fallbackDates]
    return allDates.reduce<Date>((latest, current) => (current > latest ? current : latest), allDates[0])
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
