import { Controller, Get, Param } from '@nestjs/common'
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto'
import {
  PortfolioHoldingTrendResponseDto,
  PortfolioTrendResponseDto,
} from './dto/portfolio-trend.response.dto'
import { PortfolioService } from './portfolio.service'

@ApiTags('portfolio')
@Controller('portfolio')
@ApiHeader({ name: 'X-User-Id', description: 'User ID', required: true })
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('summary')
  @ApiOkResponse({ type: PortfolioSummaryResponseDto })
  async getSummary(@CurrentUser() userId: string): Promise<PortfolioSummaryResponseDto> {
    return this.portfolioService.getSummary(userId)
  }

  @Get('holdings')
  @ApiOkResponse({ type: PortfolioHoldingsResponseDto })
  async getHoldings(@CurrentUser() userId: string): Promise<PortfolioHoldingsResponseDto> {
    return this.portfolioService.getHoldings(userId)
  }

  @Get('trend')
  @ApiOkResponse({ type: PortfolioTrendResponseDto })
  async getTrend(@CurrentUser() userId: string): Promise<PortfolioTrendResponseDto> {
    return this.portfolioService.getTrend(userId)
  }

  @Get('holdings/:assetId/trend')
  @ApiOkResponse({ type: PortfolioHoldingTrendResponseDto })
  async getHoldingTrend(
    @CurrentUser() userId: string,
    @Param('assetId') assetId: string,
  ): Promise<PortfolioHoldingTrendResponseDto> {
    return this.portfolioService.getHoldingTrend(userId, assetId)
  }
}
