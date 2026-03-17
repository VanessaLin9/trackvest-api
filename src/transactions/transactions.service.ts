import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { Currency, Prisma, Transaction } from '@prisma/client'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'
import { PostingService } from 'src/gl/posting.service'
import { OwnershipService } from '../common/services/ownership.service'
import { ImportTransactionsDto } from './dto/import-transactions.dto'
import { ImportTransactionsResponseDto } from './dto/import-transactions.response.dto'

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private postingService: PostingService,
    private ownershipService: OwnershipService,
  ) {}

  private readonly importHeaderMap = {
    assetName: '股名',
    tradeDate: '日期',
    quantity: '成交股數',
    netAmount: '淨收付',
    price: '成交單價',
    fee: '手續費',
    tradeTax: '交易稅',
    taxAmount: '稅款',
    brokerOrderNo: '委託書號',
    currency: '幣別',
    note: '備註',
  } as const

  private detectDelimiter(headerLine: string): ',' | '\t' {
    const tabCount = headerLine.split('\t').length
    const commaCount = headerLine.split(',').length
    return tabCount > commaCount ? '\t' : ','
  }

  private parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]

      if (char === '"') {
        const next = line[index + 1]
        if (inQuotes && next === '"') {
          current += '"'
          index += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }

      if (char === delimiter && !inQuotes) {
        values.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    values.push(current.trim())
    return values
  }

  private parseCsvRows(csvContent: string) {
    const normalized = csvContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
    if (!normalized) {
      throw new BadRequestException('CSV content is empty')
    }

    const lines = normalized
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
      throw new BadRequestException('CSV content must include a header row and at least one data row')
    }

    const delimiter = this.detectDelimiter(lines[0])
    const headers = this.parseDelimitedLine(lines[0], delimiter)
    const rows = lines.slice(1).map((line, index) => ({
      rowNumber: index + 2,
      values: this.parseDelimitedLine(line, delimiter),
    }))

    return { headers, rows }
  }

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

  private getRequiredHeaderIndex(headers: string[], headerName: string): number {
    const index = headers.indexOf(headerName)
    if (index === -1) {
      throw new BadRequestException(`Missing required import column: ${headerName}`)
    }
    return index
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

  private validateTransactionBusinessRules(
    dto: CreateTransactionDto | CreateAndUpdateTransactionDto,
  ) {
    const hasAsset = typeof dto.assetId === 'string' && dto.assetId.length > 0
    const amount = Number(dto.amount)
    const quantity = dto.quantity === undefined ? undefined : Number(dto.quantity)
    const price = dto.price === undefined ? undefined : Number(dto.price)
    const fee = dto.fee === undefined ? 0 : Number(dto.fee)
    const tax = dto.tax === undefined ? 0 : Number(dto.tax)

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number')
    }

    if (!Number.isFinite(fee) || fee < 0) {
      throw new BadRequestException('Fee must be zero or a positive number')
    }

    if (!Number.isFinite(tax) || tax < 0) {
      throw new BadRequestException('Tax must be zero or a positive number')
    }

    switch (dto.type) {
      case 'buy':
      case 'sell':
        if (!hasAsset) {
          throw new BadRequestException(`Asset is required for ${dto.type} transactions`)
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException(`Quantity must be a positive number for ${dto.type} transactions`)
        }
        if (!Number.isFinite(price) || price <= 0) {
          throw new BadRequestException(`Price must be a positive number for ${dto.type} transactions`)
        }
        return
      case 'dividend':
        if (!hasAsset) {
          throw new BadRequestException('Asset is required for dividend transactions')
        }
        if (dto.quantity !== undefined) {
          throw new BadRequestException('Quantity is not allowed for dividend transactions')
        }
        if (dto.price !== undefined) {
          throw new BadRequestException('Price is not allowed for dividend transactions')
        }
        return
      case 'deposit':
        if (hasAsset) {
          throw new BadRequestException('Asset is not allowed for deposit transactions')
        }
        if (dto.quantity !== undefined) {
          throw new BadRequestException('Quantity is not allowed for deposit transactions')
        }
        if (dto.price !== undefined) {
          throw new BadRequestException('Price is not allowed for deposit transactions')
        }
        if (fee !== 0) {
          throw new BadRequestException('Fee must be zero for deposit transactions')
        }
        if (tax !== 0) {
          throw new BadRequestException('Tax must be zero for deposit transactions')
        }
        return
      default:
        return
    }
  }

  async importTransactions(
    dto: ImportTransactionsDto,
    userId: string,
  ): Promise<ImportTransactionsResponseDto> {
    await this.ownershipService.validateAccountOwnership(dto.accountId, userId)

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: dto.accountId },
      select: { id: true, broker: true, currency: true },
    })

    if (!account.broker) {
      throw new BadRequestException('Selected account does not have a broker configured')
    }

    const { headers, rows } = this.parseCsvRows(dto.csvContent)

    const assetNameIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.assetName)
    const tradeDateIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.tradeDate)
    const quantityIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.quantity)
    const netAmountIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.netAmount)
    const priceIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.price)
    const feeIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.fee)
    const tradeTaxIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.tradeTax)
    const taxAmountIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.taxAmount)
    const brokerOrderNoIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.brokerOrderNo)
    const currencyIndex = this.getRequiredHeaderIndex(headers, this.importHeaderMap.currency)
    const noteIndex = headers.indexOf(this.importHeaderMap.note)

    const createdTransactionIds: string[] = []
    const errors: ImportTransactionsResponseDto['errors'] = []
    const seenBrokerRefs = new Set<string>()

    for (const row of rows) {
      const assetName = row.values[assetNameIndex]?.trim() ?? ''
      const tradeDateValue = row.values[tradeDateIndex]?.trim() ?? ''
      const quantityValue = row.values[quantityIndex]?.trim() ?? ''
      const netAmountValue = row.values[netAmountIndex]?.trim() ?? ''
      const priceValue = row.values[priceIndex]?.trim() ?? ''
      const feeValue = row.values[feeIndex]?.trim() ?? ''
      const tradeTaxValue = row.values[tradeTaxIndex]?.trim() ?? ''
      const taxAmountValue = row.values[taxAmountIndex]?.trim() ?? ''
      const brokerOrderNo = row.values[brokerOrderNoIndex]?.trim() ?? ''
      const currencyValue = row.values[currencyIndex]?.trim() ?? ''
      const note = noteIndex >= 0 ? row.values[noteIndex]?.trim() || undefined : undefined

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
        const created = await this.create(importDto, userId)
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

  async findAll(q: FindTransactionsDto, userId: string) {
    const isAdmin = await this.ownershipService.isAdmin(userId)
    
    const where: Prisma.TransactionWhereInput = {}
    
    // Admins can see all transactions, regular users only their own
    if (!isAdmin) {
      where.account = {
        userId,
      }
    }
    
    // 軟刪過濾
    const includeDeleted = q.includeDeleted === 'true'
    if (!includeDeleted) where.isDeleted = false

    if (q.accountId) {
      // Validate account belongs to user (or admin can access any)
      await this.ownershipService.validateAccountOwnership(q.accountId, userId)
      where.accountId = q.accountId
    }
    if (q.assetId) where.assetId = q.assetId
    if (q.from || q.to) {
      where.tradeTime = {}
      if (q.from) where.tradeTime.gte = new Date(q.from)
      if (q.to) where.tradeTime.lte = new Date(q.to)
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { tradeTime: 'desc' },
        skip: q.skip ?? 0,
        take: q.take ?? 50,
        include: {
          account: { select: { id: true, name: true, currency: true, userId: true } },
          asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
          tags: { include: { tag: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ])

    return {
      total,
      skip: q.skip ?? 0,
      take: q.take ?? 50,
      items,
    }
  }

  async create(dto: CreateTransactionDto, userId: string): Promise<Transaction> {
    // Validate account belongs to user
    await this.ownershipService.validateAccountOwnership(dto.accountId, userId)
    this.validateTransactionBusinessRules(dto)
    
    const created = await this.prisma.transaction.create({
      data: {
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: dto.type,
        amount: dto.amount,
        quantity: dto.quantity,
        price: dto.price,
        fee: dto.fee ?? 0,
        tax: dto.tax ?? 0,
        brokerOrderNo: dto.brokerOrderNo,
        tradeTime: dto.tradeTime? new Date(dto.tradeTime) : new Date(),
        note: dto.note,
      },
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
      },
    })
    
    // Get account to pass userId to posting service
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: created.accountId },
      select: { userId: true },
    })
    
    await this.postingService.postTransaction({
      userId: account.userId,
      transaction: created,
    })
    return created
  }

  async findOne(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    const transaction = await this.prisma.transaction.findUnique({ 
      where: { id },
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
        tags: { include: { tag: true } },
      },
    })
    if (!transaction) throw new NotFoundException('Transaction not found')
    return transaction
  }

  async update(id: string, dto: CreateAndUpdateTransactionDto, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    // If accountId is being updated, validate new account ownership
    if (dto.accountId) {
      await this.ownershipService.validateAccountOwnership(dto.accountId, userId)
    }
    this.validateTransactionBusinessRules(dto)
    
    return this.prisma.transaction.update({
      where: { id },
      data: {
        accountId: dto.accountId,
        assetId: dto.assetId,
        type: dto.type,
        amount: dto.amount,
        quantity: dto.quantity,
        price: dto.price,
        fee: dto.fee ?? 0,
        tax: dto.tax ?? 0,
        brokerOrderNo: dto.brokerOrderNo,
        tradeTime: dto.tradeTime ? new Date(dto.tradeTime) : new Date(),
        note: dto.note,
      },
      include: {
        account: { select: { id: true, name: true, currency: true, userId: true } },
        asset: { select: { id: true, symbol: true, name: true, baseCurrency: true } },
        tags: { include: { tag: true } },
      },
    })
  }

  async remove(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    return this.prisma.transaction.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    })
  }

  async hardDelete(id: string, userId: string) {
    // Validate ownership
    await this.ownershipService.validateTransactionOwnership(id, userId)
    
    return this.prisma.transaction.delete({ where: { id } })
  }
}
