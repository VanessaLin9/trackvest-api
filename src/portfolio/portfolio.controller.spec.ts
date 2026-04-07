import { PortfolioController } from './portfolio.controller'

describe('PortfolioController', () => {
  function createHarness() {
    const portfolioService = {
      getSummary: jest.fn(),
      getHoldings: jest.fn(),
      getTrend: jest.fn(),
      getHoldingTrend: jest.fn(),
    }

    const controller = new PortfolioController(portfolioService as never)

    return { controller, portfolioService }
  }

  it('returns portfolio summary from the service', async () => {
    const { controller, portfolioService } = createHarness()
    portfolioService.getSummary.mockResolvedValue({
      asOf: '2026-04-05T00:00:00.000Z',
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      baseCurrency: 'TWD',
      investedCapital: 1000,
      marketValue: 1200,
      totalPnl: 200,
      totalReturnRate: 0.2,
      holdingsCount: 2,
    })

    const result = await controller.getSummary('user-1', { displayCurrency: 'TWD' })

    expect(portfolioService.getSummary).toHaveBeenCalledWith('user-1', 'TWD')
    expect(result).toEqual({
      asOf: '2026-04-05T00:00:00.000Z',
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      baseCurrency: 'TWD',
      investedCapital: 1000,
      marketValue: 1200,
      totalPnl: 200,
      totalReturnRate: 0.2,
      holdingsCount: 2,
    })
  })

  it('returns portfolio holdings from the service', async () => {
    const { controller, portfolioService } = createHarness()
    portfolioService.getHoldings.mockResolvedValue({
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      items: [
        {
          assetId: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          quantity: 5,
          avgCost: 100,
          latestPrice: 120,
          latestPriceCurrency: 'USD',
          assetBaseCurrency: 'USD',
          investedAmount: 500,
          marketValue: 600,
          pnl: 100,
          returnRate: 0.2,
          weight: 1,
          lastActivitySummary: 'Buy on 2026-04-05',
        },
      ],
      allocationByType: [
        {
          type: 'equity',
          marketValue: 600,
          weight: 1,
        },
      ],
    })

    const result = await controller.getHoldings('user-1', { displayCurrency: 'TWD' })

    expect(portfolioService.getHoldings).toHaveBeenCalledWith('user-1', 'TWD')
    expect(result).toEqual({
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      items: [
        {
          assetId: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          quantity: 5,
          avgCost: 100,
          latestPrice: 120,
          latestPriceCurrency: 'USD',
          assetBaseCurrency: 'USD',
          investedAmount: 500,
          marketValue: 600,
          pnl: 100,
          returnRate: 0.2,
          weight: 1,
          lastActivitySummary: 'Buy on 2026-04-05',
        },
      ],
      allocationByType: [
        {
          type: 'equity',
          marketValue: 600,
          weight: 1,
        },
      ],
    })
  })

  it('returns portfolio trend from the service', async () => {
    const { controller, portfolioService } = createHarness()
    portfolioService.getTrend.mockResolvedValue({
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      points: [
        {
          label: '2026-04-05',
          date: '2026-04-05',
          investedCapital: 1000,
          marketValue: 1200,
        },
      ],
    })

    const result = await controller.getTrend('user-1', { displayCurrency: 'TWD' })

    expect(portfolioService.getTrend).toHaveBeenCalledWith('user-1', 'TWD')
    expect(result).toEqual({
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      points: [
        {
          label: '2026-04-05',
          date: '2026-04-05',
          investedCapital: 1000,
          marketValue: 1200,
        },
      ],
    })
  })

  it('returns a single holding trend from the service', async () => {
    const { controller, portfolioService } = createHarness()
    portfolioService.getHoldingTrend.mockResolvedValue({
      assetId: 'asset-1',
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      points: [
        {
          label: '2026-04-05',
          date: '2026-04-05',
          investedAmount: 800,
          marketValue: 900,
        },
      ],
    })

    const result = await controller.getHoldingTrend('user-1', 'asset-1', { displayCurrency: 'TWD' })

    expect(portfolioService.getHoldingTrend).toHaveBeenCalledWith('user-1', 'asset-1', 'TWD')
    expect(result).toEqual({
      assetId: 'asset-1',
      requestedDisplayCurrency: 'TWD',
      effectiveDisplayCurrency: 'TWD',
      points: [
        {
          label: '2026-04-05',
          date: '2026-04-05',
          investedAmount: 800,
          marketValue: 900,
        },
      ],
    })
  })
})
