import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { ErrorResponse } from '../common/dto'
import { Roles } from '../common/decorators/roles.decorator'
import { RefreshPricesResponseDto } from './dto/refresh-prices.response.dto'
import { SyncTaiwanPricesDto } from './dto/sync-taiwan-prices.dto'
import { SyncTaiwanPricesResponseDto } from './dto/sync-taiwan-prices.response.dto'
import { SyncUsPricesDto } from './dto/sync-us-prices.dto'
import { SyncUsPricesResponseDto } from './dto/sync-us-prices.response.dto'
import { MarketPriceService } from './market-price.service'

@ApiTags('prices')
@Controller('prices')
@ApiCookieAuth('access_token')
export class MarketPriceController {
  constructor(private readonly marketPriceService: MarketPriceService) {}

  /**
   * Manual TW+US refresh for any authenticated account.
   * Scope (dates/assets/markets) is backend-owned; request body is ignored.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RefreshPricesResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponse })
  async refreshPrices(): Promise<RefreshPricesResponseDto> {
    return this.marketPriceService.refreshPrices()
  }

  @Post('sync/taiwan')
  @Roles(UserRole.admin)
  @ApiCreatedResponse({ type: SyncTaiwanPricesResponseDto })
  async syncTaiwanPrices(@Body() body: SyncTaiwanPricesDto): Promise<SyncTaiwanPricesResponseDto> {
    const result = await this.marketPriceService.syncTaiwanPrices({
      mode: body.mode,
      startDate: body.startDate,
      endDate: body.endDate,
      assetIds: body.assetIds,
      maxAssetsPerRun: body.maxAssetsPerRun,
    })
    return { ...result, market: 'tw' }
  }

  @Post('sync/us')
  @Roles(UserRole.admin)
  @ApiCreatedResponse({ type: SyncUsPricesResponseDto })
  async syncUsPrices(@Body() body: SyncUsPricesDto): Promise<SyncUsPricesResponseDto> {
    const result = await this.marketPriceService.syncUsPrices({
      mode: body.mode,
      startDate: body.startDate,
      endDate: body.endDate,
      assetIds: body.assetIds,
      maxAssetsPerRun: body.maxAssetsPerRun,
    })
    return { ...result, market: 'us' }
  }
}
