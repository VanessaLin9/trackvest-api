import { Controller, Get, Query } from '@nestjs/common'
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger'
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

  @Get('summary')
  @ApiOkResponse({ type: DashboardSummaryDto })
  async getSummary(@CurrentUser() userId: string): Promise<DashboardSummaryDto> {
    return this.dashboardService.getSummary(userId)
  }

  @Get('activity')
  @ApiOkResponse({ type: DashboardActivityDto })
  async getActivity(
    @CurrentUser() userId: string,
    @Query() query: GetDashboardActivityDto,
  ): Promise<DashboardActivityDto> {
    return this.dashboardService.getActivity(userId, query)
  }
}
