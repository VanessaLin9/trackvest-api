import { Controller, Get, Query } from '@nestjs/common'
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { DashboardService } from './dashboard.service'
import { DashboardActivityDto } from './dto/dashboard-activity.dto'
import { GetDashboardActivityDto } from './dto/get-dashboard-activity.dto'
import { DashboardSummaryDto } from './dto/dashboard-summary.dto'

@ApiTags('dashboard')
@Controller('dashboard')
@ApiCookieAuth('access_token')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // 這是 GL 聚合讀模型，不是首頁市值總覽。首頁用 /portfolio（PR #46）。
  @Get('summary')
  @ApiOperation({
    summary: 'GL summary',
    description:
      'General-ledger totals for the signed-in user. The product homepage uses /portfolio, not this route.',
  })
  @ApiOkResponse({ type: DashboardSummaryDto })
  async getSummary(@CurrentUser() userId: string): Promise<DashboardSummaryDto> {
    return this.dashboardService.getSummary(userId)
  }

  @Get('activity')
  @ApiOperation({
    summary: 'GL activity',
    description:
      'Recent general-ledger activity. Not the holding activity line on the portfolio homepage.',
  })
  @ApiOkResponse({ type: DashboardActivityDto })
  async getActivity(
    @CurrentUser() userId: string,
    @Query() query: GetDashboardActivityDto,
  ): Promise<DashboardActivityDto> {
    return this.dashboardService.getActivity(userId, query)
  }
}
