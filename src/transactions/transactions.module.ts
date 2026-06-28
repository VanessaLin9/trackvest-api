import { Module } from '@nestjs/common'
import { CorporateActionsModule } from '../corporate-actions/corporate-actions.module'
import { GlModule } from '../gl/gl.module'
import { TransactionsController } from './transactions.controller'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { TransactionImportService } from './transaction-import.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionBusinessRulesValidator } from './transaction-business-rules-validator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'
import { TransactionsService } from './transactions.service'

@Module({
  imports: [GlModule, CorporateActionsModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionImportService,
    BrokerImportFileParser,
    TransactionBusinessRulesValidator,
    TransactionRebuildPolicyService,
    TransactionPositionOrchestratorService,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
