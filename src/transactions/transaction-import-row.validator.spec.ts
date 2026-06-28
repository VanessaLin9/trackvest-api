import { Currency } from '@prisma/client'
import { TransactionImportRowValidator } from './transaction-import-row.validator'
import { RawBrokerImportRow } from './broker-import-file.parser'

describe('TransactionImportRowValidator', () => {
  const validator = new TransactionImportRowValidator()
  const accountCurrency = Currency.TWD

  const validBuyRow: RawBrokerImportRow = {
    rowNumber: 2,
    assetName: '富邦台50',
    tradeDate: '2026/03/24',
    quantity: '10',
    netAmount: '-1,015',
    price: '100',
    fee: '10',
    tradeTax: '3',
    taxAmount: '2',
    brokerOrderNo: 'BRK-001',
    currency: 'TWD',
    note: '整股',
  }

  function validate(row: RawBrokerImportRow) {
    return validator.validateAndMap(row, { accountCurrency })
  }

  it('maps a valid buy row into a normalized transaction row', () => {
    const result = validate(validBuyRow)

    expect(result).toEqual({
      ok: true,
      row: {
        rowNumber: 2,
        assetName: '富邦台50',
        type: 'buy',
        amount: 1015,
        quantity: 10,
        price: 100,
        fee: 10,
        tax: 5,
        brokerOrderNo: 'BRK-001',
        tradeTime: new Date('2026-03-24T00:00:00').toISOString(),
        note: '整股',
      },
    })
  })

  it('maps a valid sell row from positive net settlement', () => {
    const result = validate({
      ...validBuyRow,
      netAmount: '520',
      brokerOrderNo: 'BRK-SELL-001',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.type).toBe('sell')
      expect(result.row.amount).toBe(520)
    }
  })

  it('rejects missing asset name', () => {
    const result = validate({ ...validBuyRow, assetName: '' })

    expect(result).toEqual({
      ok: false,
      error: { row: 2, field: '股名', message: 'Asset name is required' },
    })
  })

  it('rejects invalid trade date', () => {
    const result = validate({ ...validBuyRow, tradeDate: 'not-a-date' })

    expect(result).toEqual({
      ok: false,
      error: { row: 2, field: '日期', message: 'Trade date is invalid' },
    })
  })

  it('rejects non-positive quantity', () => {
    const result = validate({ ...validBuyRow, quantity: '0' })

    expect(result).toEqual({
      ok: false,
      error: {
        row: 2,
        field: '成交股數',
        message: 'Quantity must be a positive number',
      },
    })
  })

  it('rejects zero net settlement', () => {
    const result = validate({ ...validBuyRow, netAmount: '0' })

    expect(result).toEqual({
      ok: false,
      error: { row: 2, field: '淨收付', message: 'Net settlement cannot be zero' },
    })
  })

  it('rejects non-positive price', () => {
    const result = validate({ ...validBuyRow, price: '0' })

    expect(result).toEqual({
      ok: false,
      error: {
        row: 2,
        field: '成交單價',
        message: 'Price must be a positive number',
      },
    })
  })

  it('rejects negative fee', () => {
    const result = validate({ ...validBuyRow, fee: '-1' })

    expect(result).toEqual({
      ok: false,
      error: {
        row: 2,
        field: '手續費',
        message: 'Fee must be zero or a positive number',
      },
    })
  })

  it('rejects negative trade tax', () => {
    const result = validate({ ...validBuyRow, tradeTax: '-1' })

    expect(result).toEqual({
      ok: false,
      error: {
        row: 2,
        field: '交易稅',
        message: 'Trade tax must be zero or a positive number',
      },
    })
  })

  it('rejects negative tax amount', () => {
    const result = validate({ ...validBuyRow, taxAmount: '-1' })

    expect(result).toEqual({
      ok: false,
      error: {
        row: 2,
        field: '稅款',
        message: 'Tax amount must be zero or a positive number',
      },
    })
  })

  it('rejects missing broker order number', () => {
    const result = validate({ ...validBuyRow, brokerOrderNo: '' })

    expect(result).toEqual({
      ok: false,
      error: {
        row: 2,
        field: '委託書號',
        message: 'Broker order number is required',
      },
    })
  })

  it('rejects unsupported currency', () => {
    const result = validate({ ...validBuyRow, currency: 'GBP' })

    expect(result).toEqual({
      ok: false,
      error: { row: 2, field: '幣別', message: 'Unsupported currency: GBP' },
    })
  })

  it('rejects currency mismatch with account currency', () => {
    const result = validate({ ...validBuyRow, currency: 'USD' })

    expect(result).toEqual({
      ok: false,
      error: {
        row: 2,
        field: '幣別',
        message: 'Currency USD does not match account currency TWD',
      },
    })
  })

  it('normalizes Chinese currency labels', () => {
    const result = validate({ ...validBuyRow, currency: '台幣' })

    expect(result.ok).toBe(true)
  })

  it('reports the first validation error when multiple fields are invalid', () => {
    const result = validate({
      ...validBuyRow,
      assetName: '',
      tradeDate: 'not-a-date',
      quantity: '0',
      netAmount: '0',
      price: '0',
      fee: '-1',
      tradeTax: '-1',
      taxAmount: '-1',
      brokerOrderNo: '',
      currency: 'GBP',
    })

    expect(result).toEqual({
      ok: false,
      error: { row: 2, field: '股名', message: 'Asset name is required' },
    })
  })
})
