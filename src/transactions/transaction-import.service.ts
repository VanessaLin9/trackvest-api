import { BadRequestException, Injectable } from '@nestjs/common'
import { AccountType, Currency, Prisma } from '@prisma/client'
import { SUPPORTED_BROKER } from '../accounts/account-broker.constants'
import { OwnershipService } from '../common/services/ownership.service'
import { PrismaService } from '../prisma.service'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { ImportTransactionsDto } from './dto/import-transactions.dto'
import { ImportTransactionsResponseDto } from './dto/import-transactions.response.dto'
import { TransactionsService } from './transactions.service'

@Injectable()
export class TransactionImportService {
  constructor(
    private prisma: PrismaService,
    private ownershipService: OwnershipService,
    private transactionsService: TransactionsService,
    private brokerImportFileParser: BrokerImportFileParser,
  ) {}

  private parseNumberField(value: string | undefined, defaultValue = 0): number {
    if (value === undefined || value === '') {
      return defaultValue
    }

    const normalized = value.replace(/,/g, '')
    const numeric = Number(normalized)
    return Number.isFinite(numeric) ? numeric : Number.NaN
  }

  private parseDateField(value: string): Date | null {
    if (!value) {
      return null
    }

    const normalized = value.replace(/\//g, '-')
    const date = new Date(`${normalized}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }

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
      const assetName = row.assetName
      const tradeDateValue = row.tradeDate
      const quantityValue = row.quantity
      const netAmountValue = row.netAmount
      const priceValue = row.price
      const feeValue = row.fee
      const tradeTaxValue = row.tradeTax
      const taxAmountValue = row.taxAmount
      const brokerOrderNo = row.brokerOrderNo
      const currencyValue = row.currency
      const note = row.note

      if (!assetName) {
        errors.push({ row: row.rowNumber, field: '股名', message: 'Asset name is required' })
        continue
      }

      const tradeDate = this.parseDateField(tradeDateValue)
      if (!tradeDate) {
        errors.push({ row: row.rowNumber, field: '日期', message: 'Trade date is invalid' })
        continue
      }

      const quantity = this.parseNumberField(quantityValue, Number.NaN)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push({ row: row.rowNumber, field: '成交股數', message: 'Quantity must be a positive number' })
        continue
      }

      const netAmount = this.parseNumberField(netAmountValue, Number.NaN)
      if (!Number.isFinite(netAmount) || netAmount === 0) {
        errors.push({ row: row.rowNumber, field: '淨收付', message: 'Net settlement cannot be zero' })
        continue
      }

      const price = this.parseNumberField(priceValue, Number.NaN)
      if (!Number.isFinite(price) || price <= 0) {
        errors.push({ row: row.rowNumber, field: '成交單價', message: 'Price must be a positive number' })
        continue
      }

      const fee = this.parseNumberField(feeValue, Number.NaN)
      if (!Number.isFinite(fee) || fee < 0) {
        errors.push({ row: row.rowNumber, field: '手續費', message: 'Fee must be zero or a positive number' })
        continue
      }

      const tradeTax = this.parseNumberField(tradeTaxValue, Number.NaN)
      if (!Number.isFinite(tradeTax) || tradeTax < 0) {
        errors.push({ row: row.rowNumber, field: '交易稅', message: 'Trade tax must be zero or a positive number' })
        continue
      }

      const taxAmount = this.parseNumberField(taxAmountValue, Number.NaN)
      if (!Number.isFinite(taxAmount) || taxAmount < 0) {
        errors.push({ row: row.rowNumber, field: '稅款', message: 'Tax amount must be zero or a positive number' })
        continue
      }

      if (!brokerOrderNo) {
        errors.push({ row: row.rowNumber, field: '委託書號', message: 'Broker order number is required' })
        continue
      }

      if (seenBrokerRefs.has(brokerOrderNo)) {
        errors.push({ row: row.rowNumber, field: '委託書號', message: 'Duplicate broker order number in import file' })
        continue
      }
      seenBrokerRefs.add(brokerOrderNo)

      const existingTransaction = await this.prisma.transaction.findFirst({
        where: {
          accountId: dto.accountId,
          brokerOrderNo,
        },
        select: { id: true },
      })
      if (existingTransaction) {
        errors.push({ row: row.rowNumber, field: '委託書號', message: 'Duplicate broker order number for selected account' })
        continue
      }

      const currency = this.normalizeCurrency(currencyValue)
      if (!currency) {
        errors.push({ row: row.rowNumber, field: '幣別', message: `Unsupported currency: ${currencyValue}` })
        continue
      }
      if (currency !== account.currency) {
        errors.push({
          row: row.rowNumber,
          field: '幣別',
          message: `Currency ${currencyValue} does not match account currency ${account.currency}`,
        })
        continue
      }

      const assetId = await this.resolveAssetId(assetName, account.broker)
      if (!assetId) {
        errors.push({ row: row.rowNumber, field: '股名', message: `Asset alias not found for ${assetName}` })
        continue
      }

      const type = netAmount < 0 ? 'buy' : 'sell'
      const importDto: CreateTransactionDto = {
        accountId: dto.accountId,
        assetId,
        type,
        amount: Math.abs(netAmount),
        quantity,
        price,
        fee,
        tax: tradeTax + taxAmount,
        brokerOrderNo,
        tradeTime: tradeDate.toISOString(),
        note,
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
            row: row.rowNumber,
            field: '委託書號',
            message: 'Duplicate broker order number for selected account',
          })
          continue
        }

        errors.push({
          row: row.rowNumber,
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
