import { Injectable, NotFoundException } from '@nestjs/common'
import { AssetClass, AssetType, TxType } from '@prisma/client'
import { APP_CURRENCIES } from '../common/constants/currency.constants'
import { normalizeAssetCurrencyInput } from '../common/utils'
import { OwnershipService } from '../common/services/ownership.service'
import { roundTo, toNumber } from '../common/utils/number.util'
import { FxRateService } from '../fx/fx-rate.service'
import { PrismaService } from '../prisma.service'
import { GetPortfolioDisplayCurrencyDto } from './dto/get-portfolio-display-currency.dto'
import { PortfolioDisplayCurrencyMode } from './dto/portfolio-display-currency.types'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'

type HoldingActivityRecord = {
  assetId: string | null
  type: TxType
  tradeTime: Date
  note: string | null
}

export type HoldingOverviewItem = PortfolioHoldingsResponseDto['items'][number]

export type HoldingsSnapshot = {
  asOf: string
  displayCurrencyMode: PortfolioDisplayCurrencyMode
  requestedDisplayCurrency: string | null
  effectiveDisplayCurrency: string | null
  baseCurrency: string | null
  items: HoldingOverviewItem[]
}

type PortfolioDisplayCurrencyContext = {
  displayCurrencyMode: PortfolioDisplayCurrencyMode
  requestedDisplayCurrency: string | null
  effectiveDisplayCurrency: string
}

export type ValuationFxContext = {
  portfolioBaseCurrency: string
  rates: Map<string, number>
}

@Injectable()
export class PortfolioHoldingsSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownershipService: OwnershipService,
    private readonly fxRateService: FxRateService,
  ) {}

  async buildSnapshot(
    userId: string,
    query?: GetPortfolioDisplayCurrencyDto,
  ): Promise<HoldingsSnapshot> {
    await this.ownershipService.validateUserExists(userId)
    const requestedDisplayCurrency = this.getRequestedDisplayCurrency(query)
    const displayCurrencyMode = this.getDisplayCurrencyMode(query)

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
            assetClass: true,
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
        displayCurrencyMode,
        requestedDisplayCurrency,
        effectiveDisplayCurrency: requestedDisplayCurrency,
        baseCurrency: requestedDisplayCurrency,
        items: [],
      }
    }

    const assetIds = [...new Set(positions.map((position) => position.assetId))]
    const displayCurrencyContext = this.resolveDisplayCurrencyContext(
      positions.map((position) => position.account.currency),
      query,
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
      portfolioBaseCurrency: displayCurrencyContext.effectiveDisplayCurrency,
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
        assetClass: AssetClass
        assetCurrency: string
        quantity: number
        investedAmount: number
      }
    >()

    for (const position of positions) {
      const quantity = toNumber(position.quantity)
      const avgCost = toNumber(position.avgCost)
      const convertedInvestedAmount = this.convertAmount(
        quantity * avgCost,
        position.account.currency,
        fxContext,
      )
      const existing = groupedHoldings.get(position.assetId)

      if (!existing) {
        groupedHoldings.set(position.assetId, {
          assetId: position.assetId,
          symbol: position.asset.symbol,
          name: position.asset.name,
          type: position.asset.type,
          assetClass: position.asset.assetClass,
          assetCurrency: position.asset.baseCurrency,
          quantity,
          investedAmount: convertedInvestedAmount,
        })
        continue
      }

      existing.quantity += quantity
      existing.investedAmount += convertedInvestedAmount
    }

    const items = [...groupedHoldings.values()]
      .map((holding) => {
        const latestPriceRecord = latestPriceByAssetId.get(holding.assetId)
        const avgCost = holding.quantity > 0 ? holding.investedAmount / holding.quantity : 0
        const latestPrice = latestPriceRecord?.price ?? null
        const convertedInvestedAmount = holding.investedAmount
        const sourceMarketValue =
          latestPrice == null ? convertedInvestedAmount : holding.quantity * latestPrice
        const convertedMarketValue = this.convertAmount(
          sourceMarketValue,
          latestPrice == null ? fxContext.portfolioBaseCurrency : holding.assetCurrency,
          fxContext,
        )
        const pnl = convertedMarketValue - convertedInvestedAmount

        return {
          assetId: holding.assetId,
          symbol: holding.symbol,
          name: holding.name,
          type: holding.type,
          assetClass: holding.assetClass,
          quantity: roundTo(holding.quantity, 8),
          avgCost: roundTo(avgCost, 8),
          latestPrice: latestPrice == null ? null : roundTo(latestPrice, 8),
          latestPriceCurrency: latestPrice == null ? null : holding.assetCurrency,
          assetBaseCurrency: holding.assetCurrency,
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
      displayCurrencyMode: displayCurrencyContext.displayCurrencyMode,
      requestedDisplayCurrency: displayCurrencyContext.requestedDisplayCurrency,
      effectiveDisplayCurrency: displayCurrencyContext.effectiveDisplayCurrency,
      baseCurrency: displayCurrencyContext.effectiveDisplayCurrency,
      items: weightedItems,
    }
  }

  async buildFxContext(input: {
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

  async buildFxContextsByDate(input: {
    dates: string[]
    portfolioBaseCurrency: string
    sourceCurrencies: string[]
  }): Promise<Map<string, ValuationFxContext>> {
    const entries = await Promise.all(
      input.dates.map(async (date) => [
        date,
        await this.buildFxContext({
          portfolioBaseCurrency: input.portfolioBaseCurrency,
          sourceCurrencies: input.sourceCurrencies,
          asOf: new Date(`${date}T00:00:00.000Z`),
        }),
      ] as const),
    )

    return new Map(entries)
  }

  convertAmount(amount: number, sourceCurrency: string, fxContext: ValuationFxContext): number {
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

  resolveDisplayCurrencyContext(
    currencies: string[],
    query?: GetPortfolioDisplayCurrencyDto,
  ): PortfolioDisplayCurrencyContext {
    const requestedDisplayCurrency = this.getRequestedDisplayCurrency(query)

    if (requestedDisplayCurrency) {
      return {
        displayCurrencyMode: 'preferred-base',
        requestedDisplayCurrency,
        effectiveDisplayCurrency: requestedDisplayCurrency,
      }
    }

    const effectiveDisplayCurrency = this.getPortfolioBaseCurrency(currencies)
    return {
      displayCurrencyMode: 'portfolio-default',
      requestedDisplayCurrency: null,
      effectiveDisplayCurrency,
    }
  }

  getRequestedDisplayCurrency(query?: GetPortfolioDisplayCurrencyDto): string | null {
    return this.normalizeDisplayCurrency(query?.preferredBaseCurrency ?? query?.displayCurrency)
  }

  getDisplayCurrencyMode(query?: GetPortfolioDisplayCurrencyDto): PortfolioDisplayCurrencyMode {
    return this.getRequestedDisplayCurrency(query) ? 'preferred-base' : 'portfolio-default'
  }

  private getPortfolioBaseCurrency(currencies: string[]): string {
    const singleCurrency = this.getSingleCurrency(currencies)
    if (singleCurrency && singleCurrency !== 'MIXED') {
      return singleCurrency
    }

    return APP_CURRENCIES.includes('USD') ? 'USD' : currencies[0] ?? 'USD'
  }

  private getSingleCurrency(values: Array<string | null | undefined>): string | null {
    const unique = [...new Set(values.filter((value): value is string => Boolean(value)))]

    if (unique.length === 1) {
      return unique[0]
    }

    return unique.length === 0 ? null : 'MIXED'
  }

  private normalizeDisplayCurrency(value?: string | null): string | null {
    if (typeof value !== 'string' || value.trim() === '') {
      return null
    }

    return normalizeAssetCurrencyInput(value)
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
