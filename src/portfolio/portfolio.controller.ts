import { Controller, Get } from '@nestjs/common'
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PortfolioHoldingsResponseDto } from './dto/portfolio-holdings.response.dto'
import { PortfolioSummaryResponseDto } from './dto/portfolio-summary.response.dto'
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
}
