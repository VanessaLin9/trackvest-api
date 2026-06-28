import { BadRequestException, Injectable } from '@nestjs/common'
import { AccountType, Currency, Prisma } from '@prisma/client'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'
import { OwnershipService } from '../common/services/ownership.service'
import { PrismaService } from '../prisma.service'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { ImportTransactionsDto } from './dto/import-transactions.dto'
import { ImportTransactionsResponseDto } from './dto/import-transactions.response.dto'
import { TransactionImportRowValidator } from './transaction-import-row.validator'
import { IMPORT_ROW_FIELD_LABELS } from './transaction-import-row.types'
import { TransactionsService } from './transactions.service'

@Injectable()
export class TransactionImportService {
  constructor(
    private prisma: PrismaService,
    private ownershipService: OwnershipService,
    private transactionsService: TransactionsService,
    private brokerImportFileParser: BrokerImportFileParser,
    private transactionImportRowValidator: TransactionImportRowValidator,
  ) {}

  private normalizeCurrency(value: string): Currency | null {
    const normalized = value.trim().toUpperCase()
    switch (normalized) {
      case 'TWD':
      case '台幣':
      case '新台幣':
        return Currency.TWD
      case 'USD':
      case '美元':
      case '美金':
        return Currency.USD
      case 'JPY':
      case '日圓':
      case '日元':
        return Currency.JPY
      case 'EUR':
      case '歐元':
        return Currency.EUR
      default:
        return null
    }
  }

  private async resolveAssetId(alias: string, broker: string) {
    const brokerAlias = await this.prisma.assetAlias.findUnique({
      where: {
        alias_broker: {
          alias,
          broker,
        },
      },
      select: { assetId: true },
    })
    if (brokerAlias) {
      return brokerAlias.assetId
    }

    const globalAlias = await this.prisma.assetAlias.findUnique({
      where: {
        alias_broker: {
          alias,
          broker: '',
        },
      },
      select: { assetId: true },
    })
    return globalAlias?.assetId ?? null
  }

  async importTransactions(
    dto: ImportTransactionsDto,
    userId: string,
  ): Promise<ImportTransactionsResponseDto> {
    await this.ownershipService.validateAccountOwnership(dto.accountId, userId)

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: dto.accountId },
      select: { id: true, type: true, broker: true, currency: true },
    })

    if (account.type !== AccountType.broker) {
      throw new BadRequestException('Selected account is not a broker account')
    }

    if (!account.broker) {
      throw new BadRequestException('Selected account does not have a broker configured')
    }

    if (account.broker !== SUPPORTED_BROKER) {
      throw new BadRequestException(`Only ${SUPPORTED_BROKER} broker accounts are supported for CSV import`)
    }

    const { rows } = this.brokerImportFileParser.parse(dto.csvContent)

    const createdTransactionIds: string[] = []
    const errors: ImportTransactionsResponseDto['errors'] = []
    const seenBrokerRefs = new Set<string>()

    for (const row of rows) {
      const validation = this.transactionImportRowValidator.validateAndMap(row)
      if (validation.ok === false) {
        errors.push(validation.error)
        continue
      }

      const normalized = validation.row

      if (seenBrokerRefs.has(normalized.brokerOrderNo)) {
        errors.push({
          row: normalized.rowNumber,
          field: '委託書號',
          message: 'Duplicate broker order number in import file',
        })
        continue
      }
      seenBrokerRefs.add(normalized.brokerOrderNo)

      const existingTransaction = await this.prisma.transaction.findFirst({
        where: {
          accountId: dto.accountId,
          brokerOrderNo: normalized.brokerOrderNo,
        },
        select: { id: true },
      })
      if (existingTransaction) {
        errors.push({
          row: normalized.rowNumber,
          field: '委託書號',
          message: 'Duplicate broker order number for selected account',
        })
        continue
      }

      const currency = this.normalizeCurrency(normalized.currency)
      if (!currency) {
        errors.push({
          row: normalized.rowNumber,
          field: IMPORT_ROW_FIELD_LABELS.currency,
          message: `Unsupported currency: ${normalized.currency}`,
        })
        continue
      }
      if (currency !== account.currency) {
        errors.push({
          row: normalized.rowNumber,
          field: IMPORT_ROW_FIELD_LABELS.currency,
          message: `Currency ${normalized.currency} does not match account currency ${account.currency}`,
        })
        continue
      }

      const assetId = await this.resolveAssetId(
        normalized.assetName,
        account.broker,
      )
      if (!assetId) {
        errors.push({
          row: normalized.rowNumber,
          field: '股名',
          message: `Asset alias not found for ${normalized.assetName}`,
        })
        continue
      }

      const importDto: CreateTransactionDto = {
        accountId: dto.accountId,
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

      try {
        const created = await this.transactionsService.create(importDto, userId)
        createdTransactionIds.push(created.id)
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          errors.push({
            row: normalized.rowNumber,
            field: '委託書號',
            message: 'Duplicate broker order number for selected account',
          })
          continue
        }

        errors.push({
          row: normalized.rowNumber,
          field: 'row',
          message: error instanceof Error ? error.message : 'Failed to import row',
        })
      }
    }

    return {
      totalRows: rows.length,
      successCount: createdTransactionIds.length,
      failureCount: errors.length,
      createdTransactionIds,
      errors,
    }
  }
}
