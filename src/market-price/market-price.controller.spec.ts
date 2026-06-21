import { withEnv } from '../deployment/testing/with-env'
import { MarketPriceController } from './market-price.controller'
import { TaiwanPriceSyncModeDto } from './dto/sync-taiwan-prices.dto'
import { UsPriceSyncModeDto } from './dto/sync-us-prices.dto'
import { MarketPriceService } from './market-price.service'

describe('MarketPriceController (CP0 characterization)', () => {
  /*
   * Baseline: admin manual sync endpoints delegate directly to MarketPriceService.
   * CP3 cron flag must not affect these endpoints.
   */

  function createHarness() {
    const marketPriceService = {
      syncTaiwanPrices: jest.fn(),
      syncUsPrices: jest.fn(),
    }

    const controller = new MarketPriceController(
      marketPriceService as unknown as MarketPriceService,
    )

    return { controller, marketPriceService }
  }

  it('syncTaiwanPrices delegates to marketPriceService.syncTaiwanPrices', async () => {
    const { controller, marketPriceService } = createHarness()
    marketPriceService.syncTaiwanPrices.mockResolvedValue({
      rowsUpserted: 4,
      assetsProcessed: 2,
      assetsSkipped: 0,
    })

    const body = {
      mode: TaiwanPriceSyncModeDto.daily,
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      assetIds: ['5f9b7d4a-69d4-4a78-98f4-bc82eeac1001'],
      maxAssetsPerRun: 5,
    }

    const result = await controller.syncTaiwanPrices(body)

    expect(marketPriceService.syncTaiwanPrices).toHaveBeenCalledWith({
      mode: TaiwanPriceSyncModeDto.daily,
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      assetIds: ['5f9b7d4a-69d4-4a78-98f4-bc82eeac1001'],
      maxAssetsPerRun: 5,
    })
    expect(result).toEqual({
      rowsUpserted: 4,
      assetsProcessed: 2,
      assetsSkipped: 0,
      market: 'tw',
    })
  })

  it('syncUsPrices delegates to marketPriceService.syncUsPrices', async () => {
    const { controller, marketPriceService } = createHarness()
    marketPriceService.syncUsPrices.mockResolvedValue({
      rowsUpserted: 6,
      assetsProcessed: 3,
      assetsSkipped: 1,
    })

    const body = {
      mode: UsPriceSyncModeDto.backfill,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      assetIds: ['5f9b7d4a-69d4-4a78-98f4-bc82eeac1002'],
      maxAssetsPerRun: 10,
    }

    const result = await controller.syncUsPrices(body)

    expect(marketPriceService.syncUsPrices).toHaveBeenCalledWith({
      mode: UsPriceSyncModeDto.backfill,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      assetIds: ['5f9b7d4a-69d4-4a78-98f4-bc82eeac1002'],
      maxAssetsPerRun: 10,
    })
    expect(result).toEqual({
      rowsUpserted: 6,
      assetsProcessed: 3,
      assetsSkipped: 1,
      market: 'us',
    })
  })

  describe('when ENABLE_SCHEDULED_JOBS=false', () => {
    it('syncTaiwanPrices still delegates to marketPriceService', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'false' }, async () => {
        const { controller, marketPriceService } = createHarness()
        marketPriceService.syncTaiwanPrices.mockResolvedValue({
          rowsUpserted: 1,
          assetsProcessed: 1,
          assetsSkipped: 0,
        })

        await controller.syncTaiwanPrices({ mode: TaiwanPriceSyncModeDto.daily })

        expect(marketPriceService.syncTaiwanPrices).toHaveBeenCalledWith({
          mode: TaiwanPriceSyncModeDto.daily,
        })
      })
    })

    it('syncUsPrices still delegates to marketPriceService', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'false' }, async () => {
        const { controller, marketPriceService } = createHarness()
        marketPriceService.syncUsPrices.mockResolvedValue({
          rowsUpserted: 1,
          assetsProcessed: 1,
          assetsSkipped: 0,
        })

        await controller.syncUsPrices({ mode: UsPriceSyncModeDto.daily })

        expect(marketPriceService.syncUsPrices).toHaveBeenCalledWith({
          mode: UsPriceSyncModeDto.daily,
        })
      })
    })
  })
})
