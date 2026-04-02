import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AccountType } from '@prisma/client'
import { AccountBaseDto } from '../../accounts/dto/account.base.dto'
import { AssetBaseDto } from '../../assets/dto/asset.base.dto'
import { PostExpenseCommand } from '../../gl/dto/post-expense.command'
import { APP_CURRENCIES, SUPPORTED_CURRENCIES } from './currency.constants'

describe('currency constants', () => {
  it('keeps app-visible currencies as a subset of supported currencies', () => {
    expect(APP_CURRENCIES).toEqual(['TWD', 'USD'])
    expect(SUPPORTED_CURRENCIES).toEqual(['TWD', 'USD', 'JPY', 'EUR'])

    for (const currency of APP_CURRENCIES) {
      expect(SUPPORTED_CURRENCIES).toContain(currency)
    }
  })

  it.each([
    ['account', AccountBaseDto, { name: 'Broker', type: AccountType.broker, currency: 'JPY' }],
    ['asset', AssetBaseDto, { symbol: '7203', name: 'Toyota', type: 'equity', baseCurrency: 'EUR' }],
    [
      'gl command',
      PostExpenseCommand,
      {
        userId: 'c2610e4e-1cca-401e-afa7-1ebf541d0000',
        payFromGlAccountId: 'c2610e4e-1cca-401e-afa7-1ebf541d0001',
        expenseGlAccountId: 'c2610e4e-1cca-401e-afa7-1ebf541d0002',
        amount: 320,
        currency: 'JPY',
      },
    ],
  ])('allows supported non-app currency values for %s DTOs', async (_label, DtoClass, payload) => {
    const dto = plainToInstance(DtoClass as never, payload) as object
    const errors = await validate(dto)

    expect(errors).toHaveLength(0)
  })
})
