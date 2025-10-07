import { Controller } from '@nestjs/common'
import { TransactionsService } from './transactions.service'

@Controller('transactions')
export class TransactionsController {
  constructor(private svc: TransactionsService) {}

  //   @Get()
  //   list(@Query('includeDeleted') includeDeleted?: 'true' | 'false') {
  //     return this.svc.listAll(includeDeleted === 'true');
  //   }

  //   @Delete(':id') // 軟刪
  //   softDelete(@Param('id') id: string) {
  //     return this.svc.softDelete(id);
  //   }

  //   @Patch(':id/restore')
  //   restore(@Param('id') id: string) {
  //     return this.svc.restore(id);
  //   }
}
