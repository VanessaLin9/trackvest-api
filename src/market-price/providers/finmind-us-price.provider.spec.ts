import { FinmindUsPriceProvider } from './finmind-us-price.provider'

describe('FinmindUsPriceProvider', () => {
  const provider = new FinmindUsPriceProvider()

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
        provider: 'finmind',
      },
    ])

    fetchMock.mockRestore()
    delete process.env.FIN_MIND_TOKEN
  })
})
