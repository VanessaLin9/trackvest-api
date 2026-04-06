import { BadGatewayException } from '@nestjs/common'
import { FrankfurterFxRateProvider } from './frankfurter-fx-rate.provider'

describe('FrankfurterFxRateProvider', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('builds a Frankfurter request and normalizes the response payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { date: '2026-04-04', base: 'usd', quote: 'twd', rate: 32.4 },
      ],
    }) as never

    const provider = new FrankfurterFxRateProvider()
    const result = await provider.getDailyReferenceRates({
      base: 'usd',
      quotes: ['twd'],
      date: '2026-04-04',
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v2/rates?base=USD&quotes=TWD&date=2026-04-04',
      {
        headers: {
          accept: 'application/json',
        },
      },
    )
    expect(result).toEqual([
      {
        base: 'USD',
        quote: 'TWD',
        rate: 32.4,
        date: '2026-04-04',
        provider: 'frankfurter',
      },
    ])
  })

  it('throws when the provider returns a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as never

    const provider = new FrankfurterFxRateProvider()

    await expect(
      provider.getDailyReferenceRates({
        base: 'USD',
        quotes: ['TWD'],
      }),
    ).rejects.toThrow(new BadGatewayException('Frankfurter request failed with status 503'))
  })
})
