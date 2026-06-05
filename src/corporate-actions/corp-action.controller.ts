import { Body, Controller, Post } from '@nestjs/common'
import { ApiCookieAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { Roles } from '../common/decorators/roles.decorator'
import { SyncSplitsDto } from './dto/sync-splits.dto'
import { SyncSplitsResponseDto } from './dto/sync-splits.response.dto'
import { CorpActionService } from './corp-action.service'

@ApiTags('corp-actions')
@Controller('corp-actions')
@ApiCookieAuth('access_token')
export class CorpActionController {
  constructor(private readonly corpActionService: CorpActionService) {}

  @Post('sync/splits')
  @Roles(UserRole.admin)
  @ApiCreatedResponse({ type: SyncSplitsResponseDto })
  async syncSplits(@Body() body: SyncSplitsDto): Promise<SyncSplitsResponseDto> {
    return this.corpActionService.syncSplits({
      market: body.market,
      startDate: body.startDate,
      endDate: body.endDate,
      assetIds: body.assetIds,
    })
  }
}
