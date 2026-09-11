import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CashInLieuDto } from './dto/cash-in-lieu.dto';
import { CashInLieuService } from './cash-in-lieu.service';

@ApiTags('corp-actions')
@ApiCookieAuth('access_token')
@Controller('corp-actions')
export class CashInLieuController {
  constructor(private readonly settlements: CashInLieuService) {}

  @Post(':id/cash-in-lieu')
  @ApiOperation({
    summary: 'Record confirmed broker cash in lieu of fractional shares',
  })
  record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CashInLieuDto,
    @CurrentUser() userId: string,
  ) {
    return this.settlements.record(id, body, userId);
  }
}
