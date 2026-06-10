import { BadRequestException, Injectable } from '@nestjs/common'
import { roundTo } from '../common/utils/number.util'
import { GetPortfolioRebalanceDto } from './dto/get-portfolio-rebalance.dto'
import { PortfolioRebalanceResponseDto } from './dto/portfolio-rebalance.response.dto'
import { HoldingOverviewItem, HoldingsSnapshot } from './portfolio-holdings-snapshot.service'

type RebalanceTrackedAssetClass = 'equity' | 'bond'

const DEFAULT_REBALANCE_TARGETS: Record<RebalanceTrackedAssetClass, number> = {
  equity: 0.8,
  bond: 0.2,
}

@Injectable()
export class PortfolioRebalanceService {
  buildResponse(
    snapshot: HoldingsSnapshot,
    query?: Pick<GetPortfolioRebalanceDto, 'targetEquity' | 'targetBond'>,
  ): PortfolioRebalanceResponseDto {
    const targets = this.resolveTargets(query)
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

    const candidates = this.buildCandidates(snapshot.items)
    const suggestions = this.buildSuggestions(snapshot.items, recommendedBuyAmountByAssetClass)

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
      notes: this.buildNotes(snapshot.items, trackedMarketValue, suggestions),
    }
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

  private resolveTargets(
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

  private buildSuggestions(
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

  private buildCandidates(
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

  private buildNotes(
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
}
