import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AssetBaseDto } from './asset.base.dto'
import { FindAssetsDto } from './find-assets.dto'

describe('Asset DTOs', () => {
  it('normalizes asset create/update input before validation', async () => {
    const dto = plainToInstance(AssetBaseDto, {
      symbol: '  aapl  ',
      name: '  Apple   Inc.  ',
      type: 'equity',
      baseCurrency: ' usd ',
    })

    const errors = await validate(dto)

    expect(errors).toHaveLength(0)
    expect(dto.symbol).toBe('AAPL')
    expect(dto.name).toBe('Apple Inc.')
    expect(dto.baseCurrency).toBe('USD')
  })

  it('rejects invalid asset symbols', async () => {
    const dto = plainToInstance(AssetBaseDto, {
      symbol: 'AAPL<script>',
      name: 'Apple Inc.',
      type: 'equity',
      baseCurrency: 'USD',
    })

    const errors = await validate(dto)

    expect(errors.some((error) => error.property === 'symbol')).toBe(true)
  })

  it('normalizes asset list query filters', async () => {
    const dto = plainToInstance(FindAssetsDto, {
      q: '  apple   inc  ',
      baseCurrency: ' usd ',
      page: '2',
      take: '10',
    })

    const errors = await validate(dto)

    expect(errors).toHaveLength(0)
    expect(dto.q).toBe('apple inc')
    expect(dto.baseCurrency).toBe('USD')
    expect(dto.page).toBe(2)
    expect(dto.take).toBe(10)
  })

  it('rejects unsupported asset list search characters', async () => {
    const dto = plainToInstance(FindAssetsDto, {
      q: 'AAPL<>',
    })

    const errors = await validate(dto)

    expect(errors.some((error) => error.property === 'q')).toBe(true)
  })

  it('rejects invalid page values', async () => {
    const dto = plainToInstance(FindAssetsDto, {
      page: '0',
    })

    const errors = await validate(dto)

    expect(errors.some((error) => error.property === 'page')).toBe(true)
  })
})
