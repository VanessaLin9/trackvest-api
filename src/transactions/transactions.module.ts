import { Module } from '@nestjs/common'
import { CorporateActionsModule } from '../corporate-actions/corporate-actions.module'
import { GlModule } from '../gl/gl.module'
import { TransactionsController } from './transactions.controller'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'
import { TransactionsService } from './transactions.service'

@Module({
  imports: [GlModule, CorporateActionsModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionRebuildPolicyService,
    TransactionPositionOrchestratorService,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
