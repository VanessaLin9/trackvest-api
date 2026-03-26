import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateTransactionDto } from './create-transaction.dto'

describe('CreateTransactionDto', () => {
  it('requires assetId, quantity, and price for buy transactions', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      accountId: 'c2610e4e-1cca-401e-afa7-1ebf541d0000',
      type: 'buy',
      amount: 1015,
      tradeTime: '2026-03-25T09:30:00.000Z',
    })

    const errors = await validate(dto)
    const properties = errors.map((error) => error.property)

    expect(properties).toEqual(
      expect.arrayContaining(['assetId', 'quantity', 'price']),
    )
  })

  it('allows deposit transactions without asset, quantity, or price', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      accountId: 'c2610e4e-1cca-401e-afa7-1ebf541d0000',
      type: 'deposit',
      amount: 3000,
      tradeTime: '2026-03-25T09:30:00.000Z',
    })

    const errors = await validate(dto)

    expect(errors).toHaveLength(0)
  })
})
