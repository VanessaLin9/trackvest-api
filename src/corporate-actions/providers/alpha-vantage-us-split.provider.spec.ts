import { AlphaVantageUsSplitProvider } from './alpha-vantage-us-split.provider';

describe('AlphaVantageUsSplitProvider', () => {
  let provider: AlphaVantageUsSplitProvider;
  const query = {
    stockId: 'AAPL',
    startDate: '2020-01-01',
    endDate: '2025-12-31',
  };
  let fetchMock: jest.SpyInstance;
  const previousKey = process.env.ALPHAVANTAGE_API_KEY;
  beforeEach(() => {
    provider = new AlphaVantageUsSplitProvider();
    process.env.ALPHAVANTAGE_API_KEY = 'private-test-key';
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (previousKey === undefined) delete process.env.ALPHAVANTAGE_API_KEY;
    else process.env.ALPHAVANTAGE_API_KEY = previousKey;
  });
  function respond(payload: unknown) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);
  }

  it('maps exact forward/reverse ratios, filters dates and deduplicates events', async () => {
    respond({
      symbol: 'AAPL',
      data: [
        { effective_date: '2024-01-10', split_factor: '0.1000' },
        { effective_date: '2020-08-31', split_factor: '4.0000' },
        { effective_date: '2020-08-31', split_factor: '4.0000' },
        { effective_date: '2014-06-09', split_factor: '7.0000' },
        { effective_date: '2099-01-01', split_factor: '2.0000' },
      ],
    });
    expect(await provider.fetchSplitEvents(query)).toEqual([
      {
        stockId: 'AAPL',
        exDate: '2020-08-31',
        direction: 'split',
        ratio: 4,
        sourceKey: 'AAPL:2020-08-31',
      },
      {
        stockId: 'AAPL',
        exDate: '2024-01-10',
        direction: 'reverse_split',
        ratio: 0.1,
        sourceKey: 'AAPL:2024-01-10',
      },
    ]);
    expect(
      new URL(fetchMock.mock.calls[0][0]).searchParams.get('function'),
    ).toBe('SPLITS');
  });

  it.each([
    { Information: 'quota' },
    { Note: 'rate limit' },
    { 'Error Message': 'bad symbol' },
    {},
    null,
    { symbol: 'OTHER', data: [] },
    { symbol: 'AAPL', data: {} },
    {
      symbol: 'AAPL',
      data: [{ effective_date: '2020-02-30', split_factor: '4' }],
    },
    {
      symbol: 'AAPL',
      data: [{ effective_date: '2020-08-31', split_factor: '0' }],
    },
    {
      symbol: 'AAPL',
      data: [{ effective_date: '2020-08-31', split_factor: 'NaN' }],
    },
    {
      symbol: 'AAPL',
      data: [
        { effective_date: '2020-08-31', split_factor: '4' },
        { effective_date: '2020-08-31', split_factor: '2' },
      ],
    },
  ])('rejects incomplete or invalid responses: %j', async (payload) => {
    respond(payload);
    await expect(provider.fetchSplitEvents(query)).rejects.toThrow();
  });

  it('accepts an explicitly empty history', async () => {
    respond({ symbol: 'AAPL', data: [] });
    expect(await provider.fetchSplitEvents(query)).toEqual([]);
  });

  it('reuses full history across windows but refreshes it after one minute', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    respond({
      symbol: 'AAPL',
      data: [
        { effective_date: '2014-06-09', split_factor: '7' },
        { effective_date: '2020-08-31', split_factor: '4' },
      ],
    });
    expect(await provider.fetchSplitEvents(query)).toHaveLength(1);
    expect(
      await provider.fetchSplitEvents({ ...query, startDate: '2010-01-01' }),
    ).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now.mockReturnValue(61_000);
    await provider.fetchSplitEvents(query);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not leak the API key from transport failures', async () => {
    fetchMock.mockRejectedValue(
      new Error('https://example.com/?apikey=private-test-key'),
    );
    await expect(provider.fetchSplitEvents(query)).rejects.toThrow(
      'Alpha Vantage split request failed',
    );
  });

  it('fails explicitly when the API key is absent', async () => {
    delete process.env.ALPHAVANTAGE_API_KEY;
    await expect(provider.fetchSplitEvents(query)).rejects.toThrow(
      'ALPHAVANTAGE_API_KEY is not configured',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
