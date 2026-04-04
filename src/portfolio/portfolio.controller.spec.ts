import { PortfolioController } from './portfolio.controller'

describe('PortfolioController', () => {
  function createHarness() {
    const portfolioService = {
      getSummary: jest.fn(),
      getHoldings: jest.fn(),
    }

    const controller = new PortfolioController(portfolioService as never)

    return { controller, portfolioService }
  }

  it('returns portfolio summary from the service', async () => {
    const { controller, portfolioService } = createHarness()
    portfolioService.getSummary.mockResolvedValue({
      asOf: '2026-04-05T00:00:00.000Z',
      baseCurrency: 'USD',
      investedCapital: 1000,
      marketValue: 1200,
      totalPnl: 200,
      totalReturnRate: 0.2,
      holdingsCount: 2,
    })

    const result = await controller.getSummary('user-1')

    expect(portfolioService.getSummary).toHaveBeenCalledWith('user-1')
    expect(result).toEqual({
      asOf: '2026-04-05T00:00:00.000Z',
      baseCurrency: 'USD',
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
      items: [
        {
          assetId: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          quantity: 5,
          avgCost: 100,
          latestPrice: 120,
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

    const result = await controller.getHoldings('user-1')

    expect(portfolioService.getHoldings).toHaveBeenCalledWith('user-1')
    expect(result).toEqual({
      items: [
        {
          assetId: 'asset-1',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'equity',
          quantity: 5,
          avgCost: 100,
          latestPrice: 120,
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
})
