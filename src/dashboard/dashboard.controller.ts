import { Controller, Get } from '@nestjs/common'
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { DashboardService } from './dashboard.service'
import { DashboardSummaryDto } from './dto/dashboard-summary.dto'

@ApiTags('dashboard')
@Controller('dashboard')
@ApiHeader({ name: 'X-User-Id', description: 'User ID', required: true })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOkResponse({ type: DashboardSummaryDto })
  async getSummary(@CurrentUser() userId: string): Promise<DashboardSummaryDto> {
    return this.dashboardService.getSummary(userId)
  }
}
