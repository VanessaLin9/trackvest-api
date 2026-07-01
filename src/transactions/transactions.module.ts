import { Module } from '@nestjs/common'
import { CorporateActionsModule } from '../corporate-actions/corporate-actions.module'
import { GlModule } from '../gl/gl.module'
import { TransactionsController } from './transactions.controller'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { ImportAssetAliasResolver } from './import-asset-alias.resolver'
import { ImportBrokerAccountGuard } from './import-broker-account.guard'
import { ImportBrokerOrderDuplicateChecker } from './import-broker-order-duplicate.checker'
import { TransactionImportService } from './transaction-import.service'
import { TransactionPositionOrchestratorService } from './transaction-position-orchestrator.service'
import { TransactionBusinessRulesValidator } from './transaction-business-rules-validator.service'
import { TransactionRebuildPolicyService } from './transaction-rebuild-policy.service'
import { TransactionImportRowValidator } from './transaction-import-row.validator'
import { TransactionsService } from './transactions.service'

@Module({
  imports: [GlModule, CorporateActionsModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionImportService,
    BrokerImportFileParser,
    ImportBrokerAccountGuard,
    ImportAssetAliasResolver,
    ImportBrokerOrderDuplicateChecker,
    TransactionImportRowValidator,
    TransactionBusinessRulesValidator,
    TransactionRebuildPolicyService,
    TransactionPositionOrchestratorService,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
