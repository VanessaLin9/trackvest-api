import { FinmindUsPriceProvider } from './finmind-us-price.provider'
import { AlphaVantageUsSplitProvider } from '../../corporate-actions/providers/alpha-vantage-us-split.provider'

describe('FinmindUsPriceProvider', () => {
  const splits = { fetchSplitEvents: jest.fn().mockResolvedValue([]) }
  const provider = new FinmindUsPriceProvider(splits as unknown as AlphaVantageUsSplitProvider)

  it('restores historical OHLC using splits after the requested end date', async () => {
    const savedToken = process.env.FIN_MIND_TOKEN
    process.env.FIN_MIND_TOKEN = 'test-token'
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: 200, data: [
      { date: '2020-08-28', stock_id: 'AAPL', Open: 125, High: 126, Low: 124, Close: 124.81, Adj_Close: 120.96, Volume: 1000 },
      { date: '2020-08-31', stock_id: 'AAPL', Open: 128, High: 130, Low: 127, Close: 129.04, Adj_Close: 125.06, Volume: 2000 },
    ] }) } as Response)
    splits.fetchSplitEvents.mockResolvedValueOnce([{ exDate: '2020-08-31', ratio: 4 }])
    try {
      const rows = await provider.getDailyPrices({ stockId: 'AAPL', startDate: '2020-08-28', endDate: '2020-08-31' })
      expect(rows[0]).toMatchObject({ open: 500, high: 504, low: 496, close: 499.24, adjClose: 120.96 })
      expect(rows[1].close).toBe(129.04)
      expect(splits.fetchSplitEvents).toHaveBeenLastCalledWith(expect.objectContaining({ endDate: new Date().toISOString().slice(0, 10) }))
    } finally {
      fetchMock.mockRestore()
      if (savedToken === undefined) delete process.env.FIN_MIND_TOKEN
      else process.env.FIN_MIND_TOKEN = savedToken
    }
  })

  it('maps FinMind USStockPrice rows into normalized daily prices', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        data: [
          {
            date: '2026-03-02',
            stock_id: 'AAPL',
            Open: 262.41,
            High: 266.53,
            Low: 260.2,
            Close: 264.72,
            Adj_Close: 264.48,
            Volume: 41827900,
          },
        ],
      }),
    } as Response)

    process.env.FIN_MIND_TOKEN = 'test-token'

    const rows = await provider.getDailyPrices({
      stockId: 'AAPL',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    })

    expect(rows).toEqual([
      {
        date: '2026-03-02',
        stockId: 'AAPL',
        open: 262.41,
        high: 266.53,
        low: 260.2,
        close: 264.72,
        volume: 41827900,
        adjClose: 264.48,
        provider: 'finmind-us-unadjusted',
      },
    ])

    fetchMock.mockRestore()
    delete process.env.FIN_MIND_TOKEN
  })
})
