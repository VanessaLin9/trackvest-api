import { Body, Controller, Post } from '@nestjs/common'
import { ApiCookieAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { Roles } from '../common/decorators/roles.decorator'
import { SyncTaiwanPricesDto } from './dto/sync-taiwan-prices.dto'
import { SyncTaiwanPricesResponseDto } from './dto/sync-taiwan-prices.response.dto'
import { MarketPriceService } from './market-price.service'

@ApiTags('prices')
@Controller('prices')
@ApiCookieAuth('access_token')
export class MarketPriceController {
  constructor(private readonly marketPriceService: MarketPriceService) {}

  @Post('sync/taiwan')
  @Roles(UserRole.admin)
  @ApiCreatedResponse({ type: SyncTaiwanPricesResponseDto })
  syncTaiwanPrices(@Body() body: SyncTaiwanPricesDto): Promise<SyncTaiwanPricesResponseDto> {
    return this.marketPriceService.syncTaiwanPrices({
      mode: body.mode,
      startDate: body.startDate,
      endDate: body.endDate,
      assetIds: body.assetIds,
      maxAssetsPerRun: body.maxAssetsPerRun,
    })
  }
}
