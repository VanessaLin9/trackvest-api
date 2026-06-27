import { BadRequestException } from '@nestjs/common'
import { TransactionBusinessRulesValidator } from './transaction-business-rules-validator.service'
import { CreateTransactionDto } from './dto/create-transaction.dto'

describe('TransactionBusinessRulesValidator', () => {
  const accountId = 'c2610e4e-1cca-401e-afa7-1ebf541d0000'
  const assetId = 'e8e1d0a6-1234-5678-9abc-def012345678'
  const tradeTime = '2026-03-25T09:30:00.000Z'

  const validator = new TransactionBusinessRulesValidator()

  function expectValidationError(
    dto: CreateTransactionDto,
    message: string,
  ): void {
    expect(() => validator.validate(dto)).toThrow(BadRequestException)
    expect(() => validator.validate(dto)).toThrow(message)
  }

  describe('common numeric rules', () => {
    it.each([
      ['zero amount', 0],
      ['negative amount', -100],
      ['NaN amount', Number.NaN],
      ['Infinity amount', Number.POSITIVE_INFINITY],
    ] as const)('rejects %s', (_label, amount) => {
      expectValidationError(
        {
          accountId,
          assetId,
          type: 'buy',
          amount,
          quantity: 10,
          price: 100,
          tradeTime,
        },
        'Amount must be a positive number',
      )
    })

    it.each([
      ['negative fee', -1],
      ['NaN fee', Number.NaN],
    ] as const)('rejects %s', (_label, fee) => {
      expectValidationError(
        {
          accountId,
          assetId,
          type: 'buy',
          amount: 1000,
          quantity: 10,
          price: 100,
          fee,
          tradeTime,
        },
        'Fee must be zero or a positive number',
      )
    })

    it.each([
      ['negative tax', -1],
      ['NaN tax', Number.NaN],
    ] as const)('rejects %s', (_label, tax) => {
      expectValidationError(
        {
          accountId,
          assetId,
          type: 'buy',
          amount: 1000,
          quantity: 10,
          price: 100,
          tax,
          tradeTime,
        },
        'Tax must be zero or a positive number',
      )
    })

    it('defaults undefined fee and tax to zero', () => {
      expect(() =>
        validator.validate({
          accountId,
          type: 'deposit',
          amount: 1000,
          tradeTime,
        }),
      ).not.toThrow()
    })
  })

  describe('buy transactions', () => {
    const validBuy: CreateTransactionDto = {
      accountId,
      assetId,
      type: 'buy',
      amount: 1015,
      quantity: 10,
      price: 100,
      fee: 15,
      tradeTime,
    }

    it('accepts valid buy input', () => {
      expect(() => validator.validate(validBuy)).not.toThrow()
    })

    it('rejects missing asset', () => {
      expectValidationError(
        { ...validBuy, assetId: undefined },
        'Asset is required for buy transactions',
      )
    })

    it('rejects empty asset id', () => {
      expectValidationError(
        { ...validBuy, assetId: '' },
        'Asset is required for buy transactions',
      )
    })

    it.each([
      ['zero quantity', 0],
      ['negative quantity', -1],
      ['NaN quantity', Number.NaN],
      ['missing quantity', undefined],
    ] as const)('rejects %s', (_label, quantity) => {
      expectValidationError(
        { ...validBuy, quantity },
        'Quantity must be a positive number for buy transactions',
      )
    })

    it.each([
      ['zero price', 0],
      ['negative price', -1],
      ['NaN price', Number.NaN],
      ['missing price', undefined],
    ] as const)('rejects %s', (_label, price) => {
      expectValidationError(
        { ...validBuy, price },
        'Price must be a positive number for buy transactions',
      )
    })
  })

  describe('sell transactions', () => {
    const validSell: CreateTransactionDto = {
      accountId,
      assetId,
      type: 'sell',
      amount: 508,
      quantity: 4,
      price: 130,
      fee: 10,
      tax: 2,
      tradeTime,
    }

    it('accepts valid sell input', () => {
      expect(() => validator.validate(validSell)).not.toThrow()
    })

    it('rejects missing asset', () => {
      expectValidationError(
        { ...validSell, assetId: undefined },
        'Asset is required for sell transactions',
      )
    })

    it('rejects non-positive quantity', () => {
      expectValidationError(
        { ...validSell, quantity: 0 },
        'Quantity must be a positive number for sell transactions',
      )
    })

    it('rejects non-positive price', () => {
      expectValidationError(
        { ...validSell, price: 0 },
        'Price must be a positive number for sell transactions',
      )
    })
  })

  describe('dividend transactions', () => {
    const validDividend: CreateTransactionDto = {
      accountId,
      assetId,
      type: 'dividend',
      amount: 120,
      tradeTime,
    }

    it('accepts valid dividend input', () => {
      expect(() => validator.validate(validDividend)).not.toThrow()
    })

    it('rejects missing asset', () => {
      expectValidationError(
        { ...validDividend, assetId: undefined },
        'Asset is required for dividend transactions',
      )
    })

    it('rejects quantity', () => {
      expectValidationError(
        { ...validDividend, quantity: 1 },
        'Quantity is not allowed for dividend transactions',
      )
    })

    it('rejects price', () => {
      expectValidationError(
        { ...validDividend, price: 100 },
        'Price is not allowed for dividend transactions',
      )
    })
  })

  describe('deposit transactions', () => {
    const validDeposit: CreateTransactionDto = {
      accountId,
      type: 'deposit',
      amount: 3000,
      tradeTime,
    }

    it('accepts valid deposit input', () => {
      expect(() => validator.validate(validDeposit)).not.toThrow()
    })

    it('rejects asset', () => {
      expectValidationError(
        { ...validDeposit, assetId },
        'Asset is not allowed for deposit transactions',
      )
    })

    it('rejects quantity', () => {
      expectValidationError(
        { ...validDeposit, quantity: 1 },
        'Quantity is not allowed for deposit transactions',
      )
    })

    it('rejects price', () => {
      expectValidationError(
        { ...validDeposit, price: 100 },
        'Price is not allowed for deposit transactions',
      )
    })

    it('rejects non-zero fee', () => {
      expectValidationError(
        { ...validDeposit, fee: 5 },
        'Fee must be zero for deposit transactions',
      )
    })

    it('rejects non-zero tax', () => {
      expectValidationError(
        { ...validDeposit, tax: 3 },
        'Tax must be zero for deposit transactions',
      )
    })
  })
})
