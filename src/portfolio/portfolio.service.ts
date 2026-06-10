import { Injectable } from '@nestjs/common'
import { AssetClass, AssetType } from '@prisma/client'
import { roundTo } from '../common/utils/number.util'
import { GetPortfolioDisplayCurrencyDto } from './dto/get-portfolio-display-currency.dto'
import { GetPortfolioRebalanceDto } from './dto/get-portfolio-rebalance.dto'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'
import type { PortfolioRebalanceResponseDto } from './dto/portfolio-rebalance.response.dto'
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto'
import {
  PortfolioHoldingTrendResponseDto,
  PortfolioTrendResponseDto,
} from './dto/portfolio-trend.response.dto'
import { PortfolioHoldingsSnapshotService } from './portfolio-holdings-snapshot.service'
import { PortfolioRebalanceService } from './portfolio-rebalance.service'
import { PortfolioTrendService } from './portfolio-trend.service'

@Injectable()
export class PortfolioService {
  constructor(
    private readonly holdingsSnapshotService: PortfolioHoldingsSnapshotService,
    private readonly rebalanceService: PortfolioRebalanceService,
    private readonly trendService: PortfolioTrendService,
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
    return this.rebalanceService.buildResponse(snapshot, query)
  }

  async getTrend(
    userId: string,
    query?: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioTrendResponseDto> {
    return this.trendService.getTrend(userId, query)
  }

  async getHoldingTrend(
    userId: string,
    assetId: string,
    query?: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioHoldingTrendResponseDto> {
    return this.trendService.getHoldingTrend(userId, assetId, query)
  }
}
