import { Currency } from '@prisma/client'
import { validateImportRowCurrency } from './import-row-currency.validator'

describe('validateImportRowCurrency', () => {
  it('accepts supported currency labels', () => {
    expect(validateImportRowCurrency('台幣', Currency.TWD, 2)).toBeNull()
  })

  it('rejects unsupported currencies', () => {
    expect(validateImportRowCurrency('GBP', Currency.TWD, 2)).toEqual({
      row: 2,
      field: '幣別',
      message: 'Unsupported currency: GBP',
    })
  })

  it('rejects currencies that do not match the account currency', () => {
    expect(validateImportRowCurrency('USD', Currency.TWD, 2)).toEqual({
      row: 2,
      field: '幣別',
      message: 'Currency USD does not match account currency TWD',
    })
  })
})
