import { Injectable } from '@nestjs/common'
import { Currency } from '@prisma/client'
import { OwnershipService } from '../common/services/ownership.service'
import { PrismaService } from '../prisma.service'
import { ImportAssetAliasResolver } from './import-asset-alias.resolver'
import { ImportBrokerAccountGuard } from './import-broker-account.guard'
import { ImportBrokerOrderDuplicateChecker } from './import-broker-order-duplicate.checker'
import { ImportBrokerOrderDuplicateTracker } from './import-broker-order-duplicate.tracker'
import { mapImportCreateError } from './import-create-error.mapper'
import { validateImportRowCurrency } from './import-row-currency.validator'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { ImportTransactionsDto } from './dto/import-transactions.dto'
import { ImportTransactionsResponseDto } from './dto/import-transactions.response.dto'
import { NormalizedImportTransactionRow } from './transaction-import-row.types'
import { TransactionImportRowValidator } from './transaction-import-row.validator'
import {
  buildImportTransactionsResponse,
  createEmptyImportRunAggregate,
  ImportBrokerAccount,
  ImportRunAggregate,
} from './transaction-import-orchestration.types'
import { TransactionsService } from './transactions.service'

@Injectable()
export class TransactionImportService {
  constructor(
    private prisma: PrismaService,
    private ownershipService: OwnershipService,
    private transactionsService: TransactionsService,
    private brokerImportFileParser: BrokerImportFileParser,
    private transactionImportRowValidator: TransactionImportRowValidator,
    private importBrokerAccountGuard: ImportBrokerAccountGuard,
    private importAssetAliasResolver: ImportAssetAliasResolver,
    private importBrokerOrderDuplicateChecker: ImportBrokerOrderDuplicateChecker,
  ) {}

  async importTransactions(
    dto: ImportTransactionsDto,
    userId: string,
  ): Promise<ImportTransactionsResponseDto> {
    await this.ownershipService.validateAccountOwnership(dto.accountId, userId)

    const account = await this.loadImportAccount(dto.accountId)
    this.importBrokerAccountGuard.assertEligible(account)

    const { rows } = this.brokerImportFileParser.parse(dto.csvContent)
    const aggregate = createEmptyImportRunAggregate()
    const duplicateTracker = new ImportBrokerOrderDuplicateTracker()

    for (const row of rows) {
      await this.processParsedImportRow({
        rawRow: row,
        account,
        dto,
        userId,
        duplicateTracker,
        aggregate,
      })
    }

    return buildImportTransactionsResponse(rows.length, aggregate)
  }

  private async loadImportAccount(accountId: string): Promise<ImportBrokerAccount> {
    return this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { id: true, type: true, broker: true, currency: true },
    })
  }

  private async processParsedImportRow(params: {
    rawRow: Parameters<TransactionImportRowValidator['validateAndMap']>[0]
    account: ImportBrokerAccount
    dto: ImportTransactionsDto
    userId: string
    duplicateTracker: ImportBrokerOrderDuplicateTracker
    aggregate: ImportRunAggregate
  }): Promise<void> {
    const { rawRow, account, dto, userId, duplicateTracker, aggregate } = params

    const validation = this.transactionImportRowValidator.validateAndMap(rawRow)
    if (validation.ok === false) {
      aggregate.errors.push(validation.error)
      return
    }

    const normalized = validation.row
    const rowError = await this.resolveImportRowError(
      normalized,
      account,
      dto.accountId,
      duplicateTracker,
    )
    if (rowError) {
      aggregate.errors.push(rowError)
      return
    }

    const assetId = await this.importAssetAliasResolver.resolve(
      normalized.assetName,
      account.broker!,
    )
    if (!assetId) {
      aggregate.errors.push({
        row: normalized.rowNumber,
        field: '股名',
        message: `Asset alias not found for ${normalized.assetName}`,
      })
      return
    }

    const importDto = this.buildCreateTransactionDto(dto.accountId, assetId, normalized)

    try {
      const created = await this.transactionsService.create(importDto, userId)
      aggregate.createdTransactionIds.push(created.id)
    } catch (error: unknown) {
      aggregate.errors.push(mapImportCreateError(error, normalized.rowNumber))
    }
  }

  private async resolveImportRowError(
    normalized: NormalizedImportTransactionRow,
    account: ImportBrokerAccount,
    accountId: string,
    duplicateTracker: ImportBrokerOrderDuplicateTracker,
  ) {
    const fileDuplicateError = duplicateTracker.checkFileDuplicate(
      normalized.brokerOrderNo,
      normalized.rowNumber,
    )
    if (fileDuplicateError) {
      return fileDuplicateError
    }

    const databaseDuplicateError =
      await this.importBrokerOrderDuplicateChecker.findExistingInAccount(
        accountId,
        normalized.brokerOrderNo,
        normalized.rowNumber,
      )
    if (databaseDuplicateError) {
      return databaseDuplicateError
    }

    return validateImportRowCurrency(
      normalized.currency,
      account.currency,
      normalized.rowNumber,
    )
  }

  private buildCreateTransactionDto(
    accountId: string,
    assetId: string,
    normalized: NormalizedImportTransactionRow,
  ): CreateTransactionDto {
    return {
      accountId,
      assetId,
      type: normalized.type,
      amount: normalized.amount,
      quantity: normalized.quantity,
      price: normalized.price,
      fee: normalized.fee,
      tax: normalized.tax,
      brokerOrderNo: normalized.brokerOrderNo,
      tradeTime: normalized.tradeTime,
      note: normalized.note,
    }
  }
}
