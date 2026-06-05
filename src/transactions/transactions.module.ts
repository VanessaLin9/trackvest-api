import { Module } from '@nestjs/common'
import { CorporateActionsModule } from '../corporate-actions/corporate-actions.module'
import { GlModule } from '../gl/gl.module'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'

@Module({
  imports: [GlModule, CorporateActionsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
