import { Controller, Get, Query } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { GetFxRateDto } from './dto/get-fx-rate.dto'
import { FxRateResponseDto } from './dto/fx-rate.response.dto'
import { FxRateService } from './fx-rate.service'

@ApiTags('fx')
@Controller('fx')
export class FxRateController {
  constructor(private readonly fxRateService: FxRateService) {}

  @Get('rates/current')
  @ApiOkResponse({ type: FxRateResponseDto })
  async getCurrentRate(@Query() query: GetFxRateDto): Promise<FxRateResponseDto> {
    return this.fxRateService.getReferenceRate({
      base: query.base,
      quote: query.quote,
    })
  }
}
