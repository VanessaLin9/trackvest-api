import { FinmindTwSplitProvider } from './finmind-tw-split.provider'

describe('FinmindTwSplitProvider', () => {
  const provider = new FinmindTwSplitProvider()

  it('maps FinMind TaiwanStockSplitPrice rows into normalized split events', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 200,
        data: [
          {
            date: '2025-06-18',
            stock_id: '0050',
            type: '分割',
            before_price: 188.65,
            after_price: 47.16,
            max_price: 51.85,
            min_price: 42.45,
            open_price: 47.16,
          },
        ],
      }),
    } as Response)

    process.env.FIN_MIND_TOKEN = 'test-token'

    const events = await provider.fetchSplitEvents({
      stockId: '0050',
      startDate: '2025-06-01',
      endDate: '2025-07-31',
    })

    expect(events).toEqual([
      {
        stockId: '0050',
        exDate: '2025-06-18',
        direction: 'split',
        ratio: 4,
        beforePrice: 188.65,
        afterPrice: 47.16,
        sourceKey: '0050:2025-06-18:分割',
      },
    ])

    fetchMock.mockRestore()
    delete process.env.FIN_MIND_TOKEN
  })
})
