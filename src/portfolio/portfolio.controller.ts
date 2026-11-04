import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiCookieAuth, ApiExtraModels, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { GetPortfolioRebalanceDto } from './dto/get-portfolio-rebalance.dto'
import { GetPortfolioDisplayCurrencyDto } from './dto/get-portfolio-display-currency.dto'
import { PortfolioRebalanceResponseDto } from './dto/portfolio-rebalance.response.dto'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto'
import {
  PortfolioHoldingTrendResponseDto,
  PortfolioTrendResponseDto,
} from './dto/portfolio-trend.response.dto'
import { PortfolioService } from './portfolio.service'
import { AssetPerformanceService } from './asset-performance.service'
import { ExternalFundingService } from './external-funding.service'
import { GetPortfolioAnnualExternalFundingDto } from './dto/get-portfolio-annual-external-funding.dto'
import { PortfolioAnnualExternalFundingResponseDto } from './dto/portfolio-annual-external-funding.response.dto'
import { GetPortfolioAnnualBuysDto } from './dto/get-portfolio-annual-buys.dto'
import { GetPortfolioAnnualRealizedDto } from './dto/get-portfolio-annual-realized.dto'
import { GetPortfolioAssetPerformanceDto } from './dto/get-portfolio-asset-performance.dto'
import { PortfolioAnnualBuysResponseDto } from './dto/portfolio-annual-buys.response.dto'
import { PortfolioAnnualRealizedResponseDto } from './dto/portfolio-annual-realized.response.dto'
import { PortfolioAssetPerformanceResponseDto } from './dto/portfolio-asset-performance.response.dto'

@ApiTags('portfolio')
@Controller('portfolio')
@ApiCookieAuth('access_token')
// Keep the query DTO in components/schemas for the CP0 contract (PR #48).
@ApiExtraModels(
  GetPortfolioAssetPerformanceDto,
  PortfolioAssetPerformanceResponseDto,
  GetPortfolioAnnualBuysDto,
  PortfolioAnnualBuysResponseDto,
  GetPortfolioAnnualRealizedDto,
  PortfolioAnnualRealizedResponseDto,
  GetPortfolioAnnualExternalFundingDto,
  PortfolioAnnualExternalFundingResponseDto,
)
export class PortfolioController {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly assetPerformanceService: AssetPerformanceService,
    private readonly externalFundingService: ExternalFundingService,
  ) {}

  @Get('summary')
  @ApiOkResponse({ type: PortfolioSummaryResponseDto })
  async getSummary(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioSummaryResponseDto> {
    return this.portfolioService.getSummary(userId, query)
  }

  @Get('performance/assets')
  @ApiOkResponse({ type: PortfolioAssetPerformanceResponseDto })
  async getAssetPerformance(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioAssetPerformanceDto,
  ): Promise<PortfolioAssetPerformanceResponseDto> {
    return this.assetPerformanceService.getAssetPerformance(userId, query)
  }

  @Get('performance/annual-buys')
  @ApiOkResponse({ type: PortfolioAnnualBuysResponseDto })
  async getAnnualBuys(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioAnnualBuysDto,
  ): Promise<PortfolioAnnualBuysResponseDto> {
    return this.assetPerformanceService.getAnnualBuys(userId, query)
  }

  @Get('performance/annual-realized')
  @ApiOkResponse({ type: PortfolioAnnualRealizedResponseDto })
  async getAnnualRealized(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioAnnualRealizedDto,
  ): Promise<PortfolioAnnualRealizedResponseDto> {
    return this.assetPerformanceService.getAnnualRealized(userId, query)
  }

  @Get('performance/annual-external-funding')
  @ApiOkResponse({ type: PortfolioAnnualExternalFundingResponseDto })
  async getAnnualExternalFunding(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioAnnualExternalFundingDto,
  ): Promise<PortfolioAnnualExternalFundingResponseDto> {
    return this.externalFundingService.getAnnualExternalFunding(userId, query)
  }

  @Get('holdings')
  @ApiOkResponse({ type: PortfolioHoldingsResponseDto })
  async getHoldings(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioHoldingsResponseDto> {
    return this.portfolioService.getHoldings(userId, query)
  }

  @Get('rebalance')
  @ApiOkResponse({ type: PortfolioRebalanceResponseDto })
  async getRebalance(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioRebalanceDto,
  ): Promise<PortfolioRebalanceResponseDto> {
    return this.portfolioService.getRebalance(userId, query)
  }

  @Get('trend')
  @ApiOkResponse({ type: PortfolioTrendResponseDto })
  async getTrend(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioTrendResponseDto> {
    return this.portfolioService.getTrend(userId, query)
  }

  @Get('holdings/:assetId/trend')
  @ApiOkResponse({ type: PortfolioHoldingTrendResponseDto })
  async getHoldingTrend(
    @CurrentUser() userId: string,
    @Param('assetId') assetId: string,
    @Query() query: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioHoldingTrendResponseDto> {
    return this.portfolioService.getHoldingTrend(userId, assetId, query)
  }
}
