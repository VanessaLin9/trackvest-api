import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
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
  createEmptyImportRunAggregate,
  ImportBrokerAccount,
  ImportRunAggregate,
} from './transaction-import-orchestration.types'
import { TransactionsService } from './transactions.service'
import { TransactionImportEvaluationService } from './transaction-import-evaluation.service'
import { ImportPreviewResponseDto } from './dto/import-preview.response.dto'
import { ImportCommitResponseDto } from './dto/import-commit.response.dto'
import { ImportCommitRejectedException } from './import-commit-rejected.exception'
import { ImportPreviewResult } from './transaction-import-evaluation.types'
import { IMPORT_ERROR_CODES } from './import-error-codes'

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
    private transactionImportEvaluationService: TransactionImportEvaluationService,
  ) {}

  async previewImportTransactions(
    dto: ImportTransactionsDto,
    userId: string,
  ): Promise<ImportPreviewResponseDto> {
    const { account, rows, accountId } = await this.prepareImportContext(dto, userId)
    return this.transactionImportEvaluationService.evaluateImportRows({
      rawRows: rows,
      account,
      accountId,
    })
  }

  async commitImportTransactions(
    dto: ImportTransactionsDto,
    userId: string,
  ): Promise<ImportCommitResponseDto> {
    const { account, rows, accountId } = await this.prepareImportContext(dto, userId)

    const preview = await this.transactionImportEvaluationService.evaluateImportRows({
      rawRows: rows,
      account,
      accountId,
    })
    if (!preview.canCommit) {
      throw ImportCommitRejectedException.forPreviewErrors(preview)
    }

    const duplicateTracker = new ImportBrokerOrderDuplicateTracker()
    const rawRowsByNumber = new Map(rows.map((row) => [row.rowNumber, row]))
    let createdTransactionIds: string[] = []
    let skippedCount = preview.skippedCount
    let failedRowNumber: number | null = null

    try {
      await this.prisma.$transaction(async (tx) => {
        const batchCreatedIds: string[] = []
        let batchSkipped = 0

        for (const rowNumber of preview.writeOrderRowNumbers) {
          failedRowNumber = rowNumber
          const rawRow = rawRowsByNumber.get(rowNumber)
          if (!rawRow) {
            throw new BadRequestException(
              `Import write order references missing row ${rowNumber}`,
            )
          }

          const outcome = await this.writeReadyImportRow({
            rawRow,
            account,
            dto,
            db: tx,
            duplicateTracker,
          })

          if (outcome.status === 'skipped') {
            batchSkipped += 1
          } else {
            batchCreatedIds.push(outcome.id)
          }
        }

        createdTransactionIds = batchCreatedIds
        skippedCount = preview.skippedCount + batchSkipped
      })
    } catch (error: unknown) {
      if (error instanceof ImportCommitRejectedException) {
        throw error
      }

      const rowNumber = failedRowNumber ?? 0
      const mappedError = mapImportCreateError(error, rowNumber)
      const aggregate = createEmptyImportRunAggregate()
      aggregate.skippedCount = preview.skippedCount
      aggregate.errors.push(mappedError)

      throw ImportCommitRejectedException.forPartialCommitFailure({
        preview: this.buildCommitFailurePreview(preview, aggregate),
        aggregate,
      })
    }

    return {
      totalRows: rows.length,
      successCount: createdTransactionIds.length,
      skippedCount,
      failureCount: 0,
      createdTransactionIds,
    }
  }

  private async prepareImportContext(dto: ImportTransactionsDto, userId: string) {
    await this.ownershipService.validateAccountOwnership(dto.accountId, userId)

    const account = await this.loadImportAccount(dto.accountId)
    this.importBrokerAccountGuard.assertEligible(account)

    const { rows } = this.brokerImportFileParser.parse(dto.csvContent)
    return { account, rows, accountId: dto.accountId }
  }

  private buildCommitFailurePreview(
    preview: ImportPreviewResult,
    aggregate: ImportRunAggregate,
  ): ImportPreviewResult {
    const erroredRows = new Set(aggregate.errors.map((error) => error.row))

    return {
      ...preview,
      canCommit: false,
      readyCount: preview.rows.filter(
        (row) => row.status === 'ready' && !erroredRows.has(row.row),
      ).length,
      skippedCount: aggregate.skippedCount,
      errorCount: preview.errorCount + aggregate.errors.length,
      rows: preview.rows.map((row) => {
        const commitError = aggregate.errors.find((error) => error.row === row.row)
        if (!commitError) {
          return row
        }

        return {
          ...row,
          status: 'error' as const,
          errors: [
            ...row.errors,
            {
              code: IMPORT_ERROR_CODES.IMPORT_COMMIT_FAILED,
              field: commitError.field,
              message: commitError.message,
            },
          ],
        }
      }),
    }
  }

  async importTransactions(
    dto: ImportTransactionsDto,
    userId: string,
  ): Promise<ImportTransactionsResponseDto> {
    const result = await this.commitImportTransactions(dto, userId)

    return {
      totalRows: result.totalRows,
      successCount: result.successCount,
      failureCount: result.failureCount,
      createdTransactionIds: result.createdTransactionIds,
      errors: [],
    }
  }

  private async loadImportAccount(accountId: string): Promise<ImportBrokerAccount> {
    return this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { id: true, type: true, broker: true, currency: true },
    })
  }

  private async writeReadyImportRow(params: {
    rawRow: Parameters<TransactionImportRowValidator['validateAndMap']>[0]
    account: ImportBrokerAccount
    dto: ImportTransactionsDto
    db: Prisma.TransactionClient
    duplicateTracker: ImportBrokerOrderDuplicateTracker
  }): Promise<{ status: 'created'; id: string } | { status: 'skipped' }> {
    const { rawRow, account, dto, db, duplicateTracker } = params

    const validation = this.transactionImportRowValidator.validateAndMap(rawRow)
    if (validation.ok === false) {
      throw new BadRequestException(validation.error.message)
    }

    const normalized = validation.row
    const fileDuplicateError = duplicateTracker.checkFileDuplicate(
      normalized.brokerOrderNo,
      normalized.rowNumber,
    )
    if (fileDuplicateError) {
      throw new BadRequestException(fileDuplicateError.message)
    }

    const alreadyImported =
      await this.importBrokerOrderDuplicateChecker.findExistingInAccount(
        dto.accountId,
        normalized.brokerOrderNo,
        normalized.rowNumber,
        db,
      )
    if (alreadyImported) {
      return { status: 'skipped' }
    }

    const currencyError = validateImportRowCurrency(
      normalized.currency,
      account.currency,
      normalized.rowNumber,
    )
    if (currencyError) {
      throw new BadRequestException(currencyError.message)
    }

    const assetId = await this.importAssetAliasResolver.resolve(
      normalized.assetName,
      account.broker!,
      db,
    )
    if (!assetId) {
      throw new BadRequestException(
        `Asset alias not found for ${normalized.assetName}`,
      )
    }

    const importDto = this.buildCreateTransactionDto(dto.accountId, assetId, normalized)
    const created = await this.transactionsService.createInTransaction(importDto, db)
    return { status: 'created', id: created.id }
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
