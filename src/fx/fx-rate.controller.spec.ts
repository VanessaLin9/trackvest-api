import { FxRateController } from './fx-rate.controller'

describe('FxRateController', () => {
  function createHarness() {
    const fxRateService = {
      getTodayReferenceRate: jest.fn(),
    }

    const controller = new FxRateController(fxRateService as never)

    return { controller, fxRateService }
  }

  it('returns today FX reference rate from the service', async () => {
    const { controller, fxRateService } = createHarness()
    fxRateService.getTodayReferenceRate.mockResolvedValue({
      base: 'TWD',
      quote: 'USD',
      rate: 0.03125,
      date: '2026-04-14',
      provider: 'db',
    })

    const result = await controller.getTodayRate({
      base: 'TWD',
      quote: 'USD',
    })

    expect(fxRateService.getTodayReferenceRate).toHaveBeenCalledWith({
      base: 'TWD',
      quote: 'USD',
    })
    expect(result).toEqual({
      base: 'TWD',
      quote: 'USD',
      rate: 0.03125,
      date: '2026-04-14',
      provider: 'db',
    })
  })

  it('keeps /rates/current as a compatibility alias for today rate', async () => {
    const { controller, fxRateService } = createHarness()
    fxRateService.getTodayReferenceRate.mockResolvedValue({
      base: 'USD',
      quote: 'TWD',
      rate: 32.4,
      date: '2026-04-18',
      provider: 'frankfurter',
    })

    const result = await controller.getCurrentRate({
      base: 'USD',
      quote: 'TWD',
    })

    expect(fxRateService.getTodayReferenceRate).toHaveBeenCalledWith({
      base: 'USD',
      quote: 'TWD',
    })
    expect(result.date).toBe('2026-04-18')
  })
})
