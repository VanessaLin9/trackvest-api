import { FinmindTaiwanPriceProvider } from './finmind-taiwan-price.provider'

describe('FinmindTaiwanPriceProvider', () => {
  const provider = new FinmindTaiwanPriceProvider()

  it('maps FinMind TaiwanStockPrice rows into normalized daily prices', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        data: [
          {
            date: '2026-06-02',
            stock_id: '2330',
            Trading_Volume: 1000,
            Trading_money: 2000000,
            open: 2350,
            max: 2390,
            min: 2340,
            close: 2380,
            spread: 1.2,
            Trading_turnover: 12345,
          },
        ],
      }),
    } as Response)

    process.env.FIN_MIND_TOKEN = 'test-token'

    const rows = await provider.getDailyPrices({
      stockId: '2330',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
    })

    expect(rows).toEqual([
      {
        date: '2026-06-02',
        stockId: '2330',
        open: 2350,
        high: 2390,
        low: 2340,
        close: 2380,
        volume: 1000,
        turnoverAmount: 2000000,
        changeRate: 1.2,
        tradeCount: 12345,
        provider: 'finmind',
      },
    ])

    fetchMock.mockRestore()
    delete process.env.FIN_MIND_TOKEN
  })
})
