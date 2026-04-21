import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
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

@ApiTags('portfolio')
@Controller('portfolio')
@ApiSecurity('user-id')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('summary')
  @ApiOkResponse({ type: PortfolioSummaryResponseDto })
  async getSummary(
    @CurrentUser() userId: string,
    @Query() query: GetPortfolioDisplayCurrencyDto,
  ): Promise<PortfolioSummaryResponseDto> {
    return this.portfolioService.getSummary(userId, query)
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
