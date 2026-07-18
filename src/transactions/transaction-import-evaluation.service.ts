import { Injectable } from '@nestjs/common'
import { toNumber } from '../common/utils/number.util'
import { PrismaService } from '../prisma.service'
import { RawBrokerImportRow } from './broker-import-file.parser'
import { ImportAssetAliasResolver } from './import-asset-alias.resolver'
import { ImportBrokerOrderDuplicateChecker } from './import-broker-order-duplicate.checker'
import { ImportBrokerOrderDuplicateTracker } from './import-broker-order-duplicate.tracker'
import { IMPORT_ERROR_CODES } from './import-error-codes'
import { mapImportRowErrorToIssue } from './import-row-issue.mapper'
import { validateImportRowCurrency } from './import-row-currency.validator'
import { planImportSellReadiness } from './import-sell-readiness.planner'
import {
  PlannerHistoryTransaction,
  PlannerImportCandidate,
  SellReadinessBlockReason,
  SELL_READINESS_BLOCK_REASONS,
} from './import-sell-readiness.planner.types'
import { NormalizedImportTransactionRow } from './transaction-import-row.types'
import { TransactionImportRowValidator } from './transaction-import-row.validator'
import {
  buildImportPreviewResult,
  ImportPreviewNormalizedTransaction,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportResolvedAsset,
  ImportRowIssue,
} from './transaction-import-evaluation.types'
import { ImportBrokerAccount } from './transaction-import-orchestration.types'

const ALREADY_IMPORTED_MESSAGE =
  'Duplicate broker order number for selected account'

const SELL_READINESS_MESSAGES: Record<SellReadinessBlockReason, string> = {
  [SELL_READINESS_BLOCK_REASONS.SELL_HISTORY_REQUIRED]:
    'Sell requires earlier buy history that is not available',
  [SELL_READINESS_BLOCK_REASONS.SELL_INSUFFICIENT_LOTS]:
    'Sell quantity exceeds available lots under the import plan',
  [SELL_READINESS_BLOCK_REASONS.SELL_SAME_DAY_ORDER_AMBIGUOUS]:
    'Same-day buy/sell order is ambiguous without reliable execution time',
}

@Injectable()
export class TransactionImportEvaluationService {
  constructor(
    private prisma: PrismaService,
    private transactionImportRowValidator: TransactionImportRowValidator,
    private importAssetAliasResolver: ImportAssetAliasResolver,
    private importBrokerOrderDuplicateChecker: ImportBrokerOrderDuplicateChecker,
  ) {}

  async evaluateImportRows(params: {
    rawRows: RawBrokerImportRow[]
    account: ImportBrokerAccount
    accountId: string
  }): Promise<ImportPreviewResult> {
    const duplicateTracker = new ImportBrokerOrderDuplicateTracker()
    const rows: ImportPreviewRow[] = []

    for (const rawRow of params.rawRows) {
      rows.push(
        await this.evaluateParsedImportRow({
          rawRow,
          account: params.account,
          accountId: params.accountId,
          duplicateTracker,
        }),
      )
    }

    const { rows: rowsWithSellReadiness, writeOrderRowNumbers } =
      await this.applySellReadinessPlan(rows, params.accountId)

    return buildImportPreviewResult(rowsWithSellReadiness, writeOrderRowNumbers)
  }

  private async evaluateParsedImportRow(params: {
    rawRow: RawBrokerImportRow
    account: ImportBrokerAccount
    accountId: string
    duplicateTracker: ImportBrokerOrderDuplicateTracker
  }): Promise<ImportPreviewRow> {
    const { rawRow, account, accountId, duplicateTracker } = params
    const baseRow = this.buildBasePreviewRow(rawRow)

    const validation = this.transactionImportRowValidator.validateAndMap(rawRow)
    if (validation.ok === false) {
      return {
        ...baseRow,
        status: 'error',
        errors: [mapImportRowErrorToIssue(validation.error)],
        warnings: [],
      }
    }

    const normalized = validation.row
    const fileDuplicateError = duplicateTracker.checkFileDuplicate(
      normalized.brokerOrderNo,
      normalized.rowNumber,
    )
    if (fileDuplicateError) {
      return {
        ...baseRow,
        status: 'error',
        brokerOrderNo: normalized.brokerOrderNo,
        tradeDate: formatImportPreviewTradeDate(rawRow.tradeDate),
        errors: [mapImportRowErrorToIssue(fileDuplicateError)],
        warnings: [],
      }
    }

    const alreadyImported =
      await this.importBrokerOrderDuplicateChecker.findExistingInAccount(
        accountId,
        normalized.brokerOrderNo,
        normalized.rowNumber,
        this.prisma,
      )

    const currencyError = validateImportRowCurrency(
      normalized.currency,
      account.currency,
      normalized.rowNumber,
    )
    if (currencyError && !alreadyImported) {
      return {
        ...baseRow,
        status: 'error',
        brokerOrderNo: normalized.brokerOrderNo,
        tradeDate: formatImportPreviewTradeDate(rawRow.tradeDate),
        errors: [mapImportRowErrorToIssue(currencyError)],
        warnings: [],
      }
    }

    const resolvedAsset = await this.resolveImportAsset(
      normalized.assetName,
      account.broker!,
    )
    if (!resolvedAsset && !alreadyImported) {
      return {
        ...baseRow,
        status: 'error',
        brokerOrderNo: normalized.brokerOrderNo,
        tradeDate: formatImportPreviewTradeDate(rawRow.tradeDate),
        errors: [
          {
            code: IMPORT_ERROR_CODES.ASSET_ALIAS_NOT_FOUND,
            field: 'assetName',
            message: `Asset alias not found for ${normalized.assetName}`,
          },
        ],
        warnings: [],
      }
    }

    if (alreadyImported) {
      return {
        row: normalized.rowNumber,
        status: 'skipped',
        rawAssetName: normalized.assetName,
        brokerOrderNo: normalized.brokerOrderNo,
        tradeDate: formatImportPreviewTradeDate(rawRow.tradeDate),
        resolvedAsset,
        normalizedTransaction: resolvedAsset
          ? this.buildNormalizedTransaction(normalized, account.currency)
          : null,
        errors: [],
        warnings: [buildAlreadyImportedIssue()],
      }
    }

    return {
      row: normalized.rowNumber,
      status: 'ready',
      rawAssetName: normalized.assetName,
      brokerOrderNo: normalized.brokerOrderNo,
      tradeDate: formatImportPreviewTradeDate(rawRow.tradeDate),
      resolvedAsset: resolvedAsset!,
      normalizedTransaction: this.buildNormalizedTransaction(
        normalized,
        account.currency,
      ),
      errors: [],
      warnings: [],
    }
  }

  private async applySellReadinessPlan(
    rows: ImportPreviewRow[],
    accountId: string,
  ): Promise<{ rows: ImportPreviewRow[]; writeOrderRowNumbers: number[] }> {
    const candidates = buildSellReadinessCandidates(rows, accountId)
    if (candidates.length === 0) {
      return { rows, writeOrderRowNumbers: [] }
    }

    const assetIds = [...new Set(candidates.map((candidate) => candidate.assetId))]
    const history = await this.loadSellReadinessHistory(accountId, assetIds)
    const plan = planImportSellReadiness({ history, candidates })
    const blockedByRow = new Map<number, SellReadinessBlockReason>()

    for (const scope of plan.scopes) {
      for (const entry of scope.entries) {
        if (entry.status === 'blocked' && entry.blockReason) {
          blockedByRow.set(entry.rowNumber, entry.blockReason)
        }
      }
    }

    if (blockedByRow.size === 0) {
      return { rows, writeOrderRowNumbers: plan.writeOrderRowNumbers }
    }

    return {
      rows: rows.map((row) => {
        const blockReason = blockedByRow.get(row.row)
        if (!blockReason || row.status !== 'ready') {
          return row
        }

        return {
          ...row,
          status: 'error' as const,
          errors: [...row.errors, buildSellReadinessIssue(blockReason)],
        }
      }),
      writeOrderRowNumbers: plan.writeOrderRowNumbers,
    }
  }

  private async loadSellReadinessHistory(
    accountId: string,
    assetIds: string[],
  ): Promise<PlannerHistoryTransaction[]> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        accountId,
        assetId: { in: assetIds },
        type: { in: ['buy', 'sell'] },
        isDeleted: false,
      },
      select: {
        id: true,
        accountId: true,
        assetId: true,
        type: true,
        tradeTime: true,
        quantity: true,
      },
    })

    return transactions.flatMap((transaction) => {
      if (!transaction.assetId) {
        return []
      }
      if (transaction.type !== 'buy' && transaction.type !== 'sell') {
        return []
      }

      return [
        {
          id: transaction.id,
          accountId: transaction.accountId,
          assetId: transaction.assetId,
          type: transaction.type,
          tradeCalendarDate: formatBrokerTradeCalendarDate(transaction.tradeTime),
          quantity: toNumber(transaction.quantity),
        },
      ]
    })
  }

  private buildBasePreviewRow(rawRow: RawBrokerImportRow): Omit<
    ImportPreviewRow,
    'status' | 'errors' | 'warnings'
  > & {
    status: ImportPreviewRow['status']
    errors: ImportPreviewRow['errors']
    warnings: ImportPreviewRow['warnings']
  } {
    return {
      row: rawRow.rowNumber,
      status: 'error',
      rawAssetName: rawRow.assetName,
      brokerOrderNo: rawRow.brokerOrderNo,
      tradeDate: formatImportPreviewTradeDate(rawRow.tradeDate),
      resolvedAsset: null,
      normalizedTransaction: null,
      errors: [],
      warnings: [],
    }
  }

  private async resolveImportAsset(
    alias: string,
    broker: string,
  ): Promise<ImportResolvedAsset | null> {
    const assetId = await this.importAssetAliasResolver.resolve(
      alias,
      broker,
      this.prisma,
    )
    if (!assetId) {
      return null
    }

    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, symbol: true, name: true },
    })

    return asset ?? null
  }

  private buildNormalizedTransaction(
    normalized: NormalizedImportTransactionRow,
    accountCurrency: ImportBrokerAccount['currency'],
  ): ImportPreviewNormalizedTransaction {
    return {
      type: normalized.type,
      quantity: formatImportPreviewDecimal(normalized.quantity),
      unitPrice: formatImportPreviewDecimal(normalized.price),
      currency: accountCurrency,
      fees: formatImportPreviewDecimal(normalized.fee),
      taxes: formatImportPreviewDecimal(normalized.tax),
    }
  }
}

export function buildAlreadyImportedIssue(): ImportRowIssue {
  return {
    code: IMPORT_ERROR_CODES.DUPLICATE_BROKER_ORDER_ALREADY_IMPORTED,
    field: 'brokerOrderNo',
    message: ALREADY_IMPORTED_MESSAGE,
  }
}

export function buildSellReadinessIssue(
  reason: SellReadinessBlockReason,
): ImportRowIssue {
  return {
    code: reason,
    field: 'quantity',
    message: SELL_READINESS_MESSAGES[reason],
  }
}

export function isAlreadyImportedDuplicateMessage(message: string): boolean {
  return message === ALREADY_IMPORTED_MESSAGE
}

function buildSellReadinessCandidates(
  rows: ImportPreviewRow[],
  accountId: string,
): PlannerImportCandidate[] {
  return rows.flatMap((row) => {
    if (row.status !== 'ready' || !row.resolvedAsset || !row.normalizedTransaction) {
      return []
    }

    return [
      {
        rowNumber: row.row,
        accountId,
        assetId: row.resolvedAsset.id,
        type: row.normalizedTransaction.type,
        tradeCalendarDate: row.tradeDate,
        quantity: toNumber(row.normalizedTransaction.quantity),
      },
    ]
  })
}

function formatImportPreviewTradeDate(rawTradeDate: string): string {
  return rawTradeDate.trim().replace(/\//g, '-')
}

function formatImportPreviewDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value)
}

/**
 * Broker statements use Taiwan calendar dates. Import stores local midnight;
 * DB history must use the same calendar-day policy, not the UTC day of tradeTime.
 */
export function formatBrokerTradeCalendarDate(tradeTime: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tradeTime)
}
