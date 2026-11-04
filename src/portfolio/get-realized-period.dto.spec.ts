import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import {
  GetRealizedAssetsDto,
  GetRealizedPeriodsDto,
  GetRealizedTradesDto,
} from './dto/get-realized-period.dto'

async function errorsOf(type: new () => object, plain: object) {
  return validate(plainToInstance(type, plain))
}

describe('realized period query validation', () => {
  it('accepts a year, a normalized currency, and the default page', async () => {
    const assets = plainToInstance(GetRealizedAssetsDto, {
      year: '2024',
      currency: ' twd ',
    })
    const trades = plainToInstance(GetRealizedTradesDto, {
      year: '2024',
      currency: 'usd',
      assetId: '11111111-1111-4111-8111-111111111111',
      month: '3',
      skip: '0',
      take: '20',
    })

    expect(await validate(assets)).toEqual([])
    expect(assets.currency).toBe('TWD')
    expect(assets.year).toBe(2024)
    expect(await validate(trades)).toEqual([])
    expect(trades.currency).toBe('USD')
    expect(trades.month).toBe(3)
  })

  it.each([
    [{}, 'year'],
    [{ year: '1899' }, 'year'],
    [{ year: '10000' }, 'year'],
    [{ year: '2024.5' }, 'year'],
    [{ year: 'abc' }, 'year'],
    [{ year: '2024', accountId: 'not-a-uuid' }, 'accountId'],
  ])('rejects periods query %j on %s', async (plain, property) => {
    const errors = await errorsOf(GetRealizedPeriodsDto, plain)
    expect(errors.map(error => error.property)).toContain(property)
  })

  it.each([
    [{ year: '2024' }, 'currency'],
    [{ year: '2024', currency: '' }, 'currency'],
    [{ year: '2024', currency: 'GBP' }, 'currency'],
    [{ year: '2024', currency: 'TWD', month: '0' }, 'month'],
    [{ year: '2024', currency: 'TWD', month: '13' }, 'month'],
    [{ year: '2024', currency: 'TWD', skip: '-1' }, 'skip'],
    [{ year: '2024', currency: 'TWD', take: '0' }, 'take'],
    [{ year: '2024', currency: 'TWD', take: '101' }, 'take'],
    [{ year: '2024', currency: 'TWD', assetId: 'asset-1' }, 'assetId'],
  ])('rejects assets or trades query %j on %s', async (plain, property) => {
    const type =
      'assetId' in plain ? GetRealizedTradesDto : GetRealizedAssetsDto
    const errors = await errorsOf(type, plain)
    expect(errors.map(error => error.property)).toContain(property)
  })
})
