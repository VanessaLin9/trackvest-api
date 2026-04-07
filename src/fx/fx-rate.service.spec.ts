import { NotFoundException } from '@nestjs/common'
import { FxRateService } from './fx-rate.service'

describe('FxRateService', () => {
  function createHarness() {
    const prisma = {
      fxRate: {
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    }
    const fxRateProvider = {
      getDailyReferenceRates: jest.fn(),
    }

    const service = new FxRateService(prisma as never, fxRateProvider as never)

    return { service, prisma, fxRateProvider }
  }

  it('returns an identity rate when base and quote are the same currency', async () => {
    const { service, prisma, fxRateProvider } = createHarness()

    const result = await service.getReferenceRate({
      base: 'usd',
      quote: 'usd',
      asOf: new Date('2026-04-05T09:00:00.000Z'),
    })

    expect(prisma.fxRate.findFirst).not.toHaveBeenCalled()
    expect(fxRateProvider.getDailyReferenceRates).not.toHaveBeenCalled()
    expect(result).toEqual({
      base: 'USD',
      quote: 'USD',
      rate: 1,
      date: '2026-04-05',
      provider: 'identity',
    })
  })

  it('returns a cached db rate before calling the provider', async () => {
    const { service, prisma, fxRateProvider } = createHarness()
    prisma.fxRate.findFirst.mockResolvedValue({
      base: 'USD',
      quote: 'TWD',
      rate: 32.1,
      asOf: new Date('2026-04-04T00:00:00.000Z'),
    })

    const result = await service.getReferenceRate({
      base: 'USD',
      quote: 'TWD',
      asOf: new Date('2026-04-05T09:00:00.000Z'),
    })

    expect(fxRateProvider.getDailyReferenceRates).not.toHaveBeenCalled()
    expect(result).toEqual({
      base: 'USD',
      quote: 'TWD',
      rate: 32.1,
      date: '2026-04-04',
      provider: 'db',
    })
  })

  it('fetches and persists a missing rate from the provider', async () => {
    const { service, prisma, fxRateProvider } = createHarness()
    prisma.fxRate.findFirst.mockResolvedValue(null)
    fxRateProvider.getDailyReferenceRates.mockResolvedValue([
      {
        base: 'USD',
        quote: 'TWD',
        rate: 32.4,
        date: '2026-04-05',
        provider: 'frankfurter',
      },
    ])

    const result = await service.getReferenceRate({
      base: 'USD',
      quote: 'TWD',
      asOf: new Date('2026-04-05T09:00:00.000Z'),
    })

    expect(fxRateProvider.getDailyReferenceRates).toHaveBeenCalledWith({
      base: 'USD',
      quotes: ['TWD'],
      date: '2026-04-05',
    })
    expect(prisma.fxRate.deleteMany).toHaveBeenCalledWith({
      where: {
        base: 'USD',
        quote: 'TWD',
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
    })
    expect(prisma.fxRate.create).toHaveBeenCalledWith({
      data: {
        base: 'USD',
        quote: 'TWD',
        rate: 32.4,
        asOf: new Date('2026-04-05T00:00:00.000Z'),
      },
    })
    expect(result).toEqual({
      base: 'USD',
      quote: 'TWD',
      rate: 32.4,
      date: '2026-04-05',
      provider: 'frankfurter',
    })
  })

  it('throws when neither db nor provider returns a rate', async () => {
    const { service, prisma, fxRateProvider } = createHarness()
    prisma.fxRate.findFirst.mockResolvedValue(null)
    fxRateProvider.getDailyReferenceRates.mockResolvedValue([])

    await expect(
      service.getReferenceRate({
        base: 'USD',
        quote: 'TWD',
        asOf: new Date('2026-04-05T09:00:00.000Z'),
      }),
    ).rejects.toThrow(new NotFoundException('FX rate not found for USD/TWD on 2026-04-05'))
  })

  it('syncs and persists a daily range of reference rates', async () => {
    const { service, prisma, fxRateProvider } = createHarness()
    fxRateProvider.getDailyReferenceRates.mockResolvedValue([
      {
        base: 'USD',
        quote: 'TWD',
        rate: 32.1,
        date: '2026-04-03',
        provider: 'frankfurter',
      },
      {
        base: 'USD',
        quote: 'TWD',
        rate: 32.2,
        date: '2026-04-04',
        provider: 'frankfurter',
      },
    ])

    const result = await service.syncReferenceRates({
      base: 'USD',
      quotes: ['TWD', 'USD', 'TWD'],
      from: new Date('2026-04-03T00:00:00.000Z'),
      to: new Date('2026-04-04T00:00:00.000Z'),
    })

    expect(fxRateProvider.getDailyReferenceRates).toHaveBeenCalledWith({
      base: 'USD',
      quotes: ['TWD'],
      from: '2026-04-03',
      to: '2026-04-04',
    })
    expect(prisma.fxRate.create).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(2)
  })
})
