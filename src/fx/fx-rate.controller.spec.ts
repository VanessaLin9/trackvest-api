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
})
