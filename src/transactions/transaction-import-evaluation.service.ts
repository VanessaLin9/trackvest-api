import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { RawBrokerImportRow } from './broker-import-file.parser'
import { ImportAssetAliasResolver } from './import-asset-alias.resolver'
import { ImportBrokerOrderDuplicateChecker } from './import-broker-order-duplicate.checker'
import { ImportBrokerOrderDuplicateTracker } from './import-broker-order-duplicate.tracker'
import { IMPORT_ERROR_CODES } from './import-error-codes'
import { mapImportRowErrorToIssue } from './import-row-issue.mapper'
import { validateImportRowCurrency } from './import-row-currency.validator'
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

    return buildImportPreviewResult(rows)
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
    const assetId = await this.importAssetAliasResolver.resolve(alias, broker)
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

export function isAlreadyImportedDuplicateMessage(message: string): boolean {
  return message === ALREADY_IMPORTED_MESSAGE
}

function formatImportPreviewTradeDate(rawTradeDate: string): string {
  return rawTradeDate.trim().replace(/\//g, '-')
}

function formatImportPreviewDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value)
}
