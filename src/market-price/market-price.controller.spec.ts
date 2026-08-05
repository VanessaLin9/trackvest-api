import {
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common'
import { PATH_METADATA, METHOD_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.config'
import type { AccessTokenPayload, AccessTokenService } from '../auth/tokens/access-token.service'
import { AuthGuard } from '../common/guards/auth.guard'
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
      refreshPrices: jest.fn(),
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

  it('refreshPrices delegates to one orchestration method and returns its contract', async () => {
    const { controller, marketPriceService } = createHarness()
    const payload = {
      status: 'partial_success' as const,
      markets: [
        {
          market: 'tw' as const,
          status: 'success' as const,
          startDate: '2026-07-20',
          endDate: '2026-08-02',
          assetsProcessed: 2,
          rowsUpserted: 18,
        },
        {
          market: 'us' as const,
          status: 'failed' as const,
          errorCode: 'PRICE_REFRESH_FAILED' as const,
          message: 'US price refresh failed',
        },
      ],
    }
    marketPriceService.refreshPrices.mockResolvedValue(payload)

    const result = await controller.refreshPrices()

    expect(marketPriceService.refreshPrices).toHaveBeenCalledTimes(1)
    expect(marketPriceService.refreshPrices).toHaveBeenCalledWith()
    expect(result).toEqual(payload)
  })

  it('refreshPrices is POST /prices/refresh with HTTP 200', () => {
    const handler = Object.getOwnPropertyDescriptor(
      MarketPriceController.prototype,
      'refreshPrices',
    )!.value

    expect(Reflect.getMetadata(PATH_METADATA, MarketPriceController)).toBe('prices')
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('refresh')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.OK)
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

    it('refreshPrices still delegates to marketPriceService', async () => {
      await withEnv({ ENABLE_SCHEDULED_JOBS: 'false' }, async () => {
        const { controller, marketPriceService } = createHarness()
        marketPriceService.refreshPrices.mockResolvedValue({
          status: 'success',
          markets: [],
        })

        await controller.refreshPrices()

        expect(marketPriceService.refreshPrices).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('auth metadata via AuthGuard', () => {
    const reflector = new Reflector()

    function buildAccessTokens(
      payloadFor: Record<string, AccessTokenPayload>,
    ): AccessTokenService {
      return {
        verify: jest.fn((token: string) => {
          const payload = payloadFor[token]
          if (!payload) throw new UnauthorizedException('Invalid or expired access token')
          return payload
        }),
        sign: jest.fn(),
      } as unknown as AccessTokenService
    }

    function buildContext(
      handler: (...args: unknown[]) => unknown,
      request: { cookies?: Record<string, string>; user?: unknown },
    ): ExecutionContext {
      return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => handler,
        getClass: () => MarketPriceController,
      } as unknown as ExecutionContext
    }

    it('allows regular authenticated users on refreshPrices', () => {
      const guard = new AuthGuard(
        reflector,
        buildAccessTokens({ 'tok-user': { sub: 'u1', role: UserRole.user } }),
      )
      const handler = Object.getOwnPropertyDescriptor(
        MarketPriceController.prototype,
        'refreshPrices',
      )!.value
      const request = { cookies: { [ACCESS_TOKEN_COOKIE]: 'tok-user' } }

      expect(guard.canActivate(buildContext(handler, request))).toBe(true)
      expect(request).toMatchObject({ user: { id: 'u1', role: UserRole.user } })
    })

    it('allows admin users on refreshPrices', () => {
      const guard = new AuthGuard(
        reflector,
        buildAccessTokens({ 'tok-admin': { sub: 'a1', role: UserRole.admin } }),
      )
      const handler = Object.getOwnPropertyDescriptor(
        MarketPriceController.prototype,
        'refreshPrices',
      )!.value
      const request = { cookies: { [ACCESS_TOKEN_COOKIE]: 'tok-admin' } }

      expect(guard.canActivate(buildContext(handler, request))).toBe(true)
    })

    it('rejects unauthenticated refreshPrices requests', () => {
      const guard = new AuthGuard(reflector, buildAccessTokens({}))
      const handler = Object.getOwnPropertyDescriptor(
        MarketPriceController.prototype,
        'refreshPrices',
      )!.value

      expect(() => guard.canActivate(buildContext(handler, { cookies: {} }))).toThrow(
        UnauthorizedException,
      )
    })

    it('keeps syncTaiwanPrices admin-only', () => {
      const guard = new AuthGuard(
        reflector,
        buildAccessTokens({ 'tok-user': { sub: 'u1', role: UserRole.user } }),
      )
      const handler = Object.getOwnPropertyDescriptor(
        MarketPriceController.prototype,
        'syncTaiwanPrices',
      )!.value
      const request = { cookies: { [ACCESS_TOKEN_COOKIE]: 'tok-user' } }

      expect(() => guard.canActivate(buildContext(handler, request))).toThrow(ForbiddenException)
    })

    it('keeps syncUsPrices admin-only', () => {
      const guard = new AuthGuard(
        reflector,
        buildAccessTokens({ 'tok-user': { sub: 'u1', role: UserRole.user } }),
      )
      const handler = Object.getOwnPropertyDescriptor(
        MarketPriceController.prototype,
        'syncUsPrices',
      )!.value
      const request = { cookies: { [ACCESS_TOKEN_COOKIE]: 'tok-user' } }

      expect(() => guard.canActivate(buildContext(handler, request))).toThrow(ForbiddenException)
    })
  })
})
