import { BadRequestException, Injectable } from '@nestjs/common'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'

type TransactionValidationDto =
  | CreateTransactionDto
  | CreateAndUpdateTransactionDto

type NormalizedNumericFields = {
  amount: number
  quantity: number | undefined
  price: number | undefined
  fee: number
  tax: number
}

@Injectable()
export class TransactionBusinessRulesValidator {
  validate(dto: TransactionValidationDto): void {
    const fields = this.normalizeNumericFields(dto)
    this.validateCommonNumericRules(fields)

    switch (dto.type) {
      case 'buy':
        this.validateBuyOrSellTradeRules(dto, fields, 'buy')
        return
      case 'sell':
        this.validateBuyOrSellTradeRules(dto, fields, 'sell')
        return
      case 'dividend':
        this.validateDividendRules(dto)
        return
      case 'deposit':
        this.validateDepositRules(dto, fields)
        return
      default:
        return
    }
  }

  private normalizeNumericFields(
    dto: TransactionValidationDto,
  ): NormalizedNumericFields {
    return {
      amount: Number(dto.amount),
      quantity:
        dto.quantity === undefined ? undefined : Number(dto.quantity),
      price: dto.price === undefined ? undefined : Number(dto.price),
      fee: dto.fee === undefined ? 0 : Number(dto.fee),
      tax: dto.tax === undefined ? 0 : Number(dto.tax),
    }
  }

  private validateCommonNumericRules(fields: NormalizedNumericFields): void {
    if (!Number.isFinite(fields.amount) || fields.amount <= 0) {
      throw new BadRequestException('Amount must be a positive number')
    }

    if (!Number.isFinite(fields.fee) || fields.fee < 0) {
      throw new BadRequestException('Fee must be zero or a positive number')
    }

    if (!Number.isFinite(fields.tax) || fields.tax < 0) {
      throw new BadRequestException('Tax must be zero or a positive number')
    }
  }

  private validateBuyOrSellTradeRules(
    dto: TransactionValidationDto,
    fields: NormalizedNumericFields,
    type: 'buy' | 'sell',
  ): void {
    const hasAsset =
      typeof dto.assetId === 'string' && dto.assetId.length > 0

    if (!hasAsset) {
      throw new BadRequestException(
        `Asset is required for ${type} transactions`,
      )
    }

    if (!Number.isFinite(fields.quantity) || fields.quantity <= 0) {
      throw new BadRequestException(
        `Quantity must be a positive number for ${type} transactions`,
      )
    }

    if (!Number.isFinite(fields.price) || fields.price <= 0) {
      throw new BadRequestException(
        `Price must be a positive number for ${type} transactions`,
      )
    }
  }

  private validateDividendRules(dto: TransactionValidationDto): void {
    const hasAsset =
      typeof dto.assetId === 'string' && dto.assetId.length > 0

    if (!hasAsset) {
      throw new BadRequestException(
        'Asset is required for dividend transactions',
      )
    }

    if (dto.quantity !== undefined) {
      throw new BadRequestException(
        'Quantity is not allowed for dividend transactions',
      )
    }

    if (dto.price !== undefined) {
      throw new BadRequestException(
        'Price is not allowed for dividend transactions',
      )
    }
  }

  private validateDepositRules(
    dto: TransactionValidationDto,
    fields: NormalizedNumericFields,
  ): void {
    const hasAsset =
      typeof dto.assetId === 'string' && dto.assetId.length > 0

    if (hasAsset) {
      throw new BadRequestException(
        'Asset is not allowed for deposit transactions',
      )
    }

    if (dto.quantity !== undefined) {
      throw new BadRequestException(
        'Quantity is not allowed for deposit transactions',
      )
    }

    if (dto.price !== undefined) {
      throw new BadRequestException(
        'Price is not allowed for deposit transactions',
      )
    }

    if (fields.fee !== 0) {
      throw new BadRequestException(
        'Fee must be zero for deposit transactions',
      )
    }

    if (fields.tax !== 0) {
      throw new BadRequestException(
        'Tax must be zero for deposit transactions',
      )
    }
  }
}
