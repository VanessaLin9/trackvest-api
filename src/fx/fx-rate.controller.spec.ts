import { FxRateController } from './fx-rate.controller'

describe('FxRateController', () => {
  function createHarness() {
    const fxRateService = {
      getReferenceRate: jest.fn(),
    }

    const controller = new FxRateController(fxRateService as never)

    return { controller, fxRateService }
  }

  it('returns the current FX reference rate from the service', async () => {
    const { controller, fxRateService } = createHarness()
    fxRateService.getReferenceRate.mockResolvedValue({
      base: 'TWD',
      quote: 'USD',
      rate: 0.03125,
      date: '2026-04-14',
      provider: 'db',
    })

    const result = await controller.getCurrentRate({
      base: 'TWD',
      quote: 'USD',
    })

    expect(fxRateService.getReferenceRate).toHaveBeenCalledWith({
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
