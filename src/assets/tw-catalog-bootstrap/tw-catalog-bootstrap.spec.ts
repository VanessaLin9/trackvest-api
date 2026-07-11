import { classifyTwCatalogRecord } from './tw-catalog-classifier'
import { fetchTwCatalogSource } from './tw-catalog-fetch'
import { normalizeTwCatalogRecord } from './tw-catalog-normalizer'
import { parseTwCatalogRow, parseTwCatalogSourceRows } from './tw-catalog-parser'
import {
  TPEX_OTC_STOCK_FIXTURE,
  TWSE_LISTED_ETF_FIXTURE,
  TWSE_LISTED_STOCK_FIXTURE,
  createTwCatalogFetchMock,
} from './tw-catalog-bootstrap.fixtures'
import { runTwCatalogDryRunPipeline } from './tw-catalog-pipeline'

describe('tw-catalog-parser', () => {
  it('maps TWSE listed stock Chinese fields', () => {
    expect(parseTwCatalogRow('twse_listed_stock', TWSE_LISTED_STOCK_FIXTURE[0])).toEqual({
      source: 'twse_listed_stock',
      symbol: '1101',
      shortName: '台泥',
      fullName: '臺灣水泥股份有限公司',
    })
  })

  it('maps TPEX OTC English fields', () => {
    expect(parseTwCatalogRow('tpex_otc_stock', TPEX_OTC_STOCK_FIXTURE[0])).toEqual({
      source: 'tpex_otc_stock',
      symbol: '1240',
      shortName: '茂生農經',
      fullName: '茂生農經股份有限公司',
    })
  })

  it('maps TWSE ETF fields', () => {
    expect(parseTwCatalogRow('twse_listed_etf', TWSE_LISTED_ETF_FIXTURE[0])).toEqual({
      source: 'twse_listed_etf',
      symbol: '0050',
      shortName: '元大台灣50',
      fundType: '國內成分證券指數股票型基金',
    })
  })

  it('filters rows with missing required fields at parse time', () => {
    const result = parseTwCatalogSourceRows('twse_listed_stock', TWSE_LISTED_STOCK_FIXTURE)
    expect(result.parsed).toHaveLength(3)
    expect(result.filtered).toBe(1)
  })
})

describe('tw-catalog-classifier', () => {
  it('classifies listed stocks as equity', () => {
    expect(
      classifyTwCatalogRecord({
        source: 'twse_listed_stock',
        symbol: '2330',
        shortName: '台積電',
      }),
    ).toEqual({
      accepted: true,
      type: 'equity',
      assetClass: 'equity',
    })
  })

  it('classifies equity ETFs as etf/equity', () => {
    expect(
      classifyTwCatalogRecord({
        source: 'twse_listed_etf',
        symbol: '0050',
        shortName: '元大台灣50',
        fundType: '國內成分證券指數股票型基金',
      }),
    ).toEqual({
      accepted: true,
      type: 'etf',
      assetClass: 'equity',
    })
  })

  it('classifies bond ETFs as etf/bond', () => {
    expect(
      classifyTwCatalogRecord({
        source: 'twse_listed_etf',
        symbol: '00937B',
        shortName: '群益台灣ESG債',
        fundType: '國內債券指數股票型基金',
      }),
    ).toEqual({
      accepted: true,
      type: 'etf',
      assetClass: 'bond',
    })
  })

  it('excludes ETN products', () => {
    expect(
      classifyTwCatalogRecord({
        source: 'twse_listed_etf',
        symbol: '02001',
        shortName: '元大台灣價值高息ETN',
        fundType: '國內ETN',
      }),
    ).toEqual({
      accepted: false,
      reason: 'ETN is excluded from v1 catalog',
    })
  })

  it('rejects non-numeric stock symbols', () => {
    expect(
      classifyTwCatalogRecord({
        source: 'twse_listed_stock',
        symbol: 'BAD',
        shortName: 'Invalid',
      }),
    ).toEqual({
      accepted: false,
      reason: 'symbol format is not supported for this source',
    })
  })

  it('rejects listed ETFs with missing fund type', () => {
    expect(
      classifyTwCatalogRecord({
        source: 'twse_listed_etf',
        symbol: '00888',
        shortName: '缺基金類型',
      }),
    ).toEqual({
      accepted: false,
      reason: 'missing ETF fund type',
    })
  })

  it('rejects listed ETFs with unrecognized fund type', () => {
    expect(
      classifyTwCatalogRecord({
        source: 'twse_listed_etf',
        symbol: '00889',
        shortName: '未知類型ETF',
        fundType: '其他不確定類型',
      }),
    ).toEqual({
      accepted: false,
      reason: 'unrecognized ETF fund type',
    })
  })
})

describe('tw-catalog-normalizer', () => {
  it('builds global aliases from short name, full name, and symbol', () => {
    const result = normalizeTwCatalogRecord({
      source: 'twse_listed_stock',
      symbol: '2330',
      shortName: '台積電',
      fullName: '台灣積體電路製造股份有限公司',
    })

    expect(result).toEqual({
      record: {
        symbol: '2330',
        name: '台積電',
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: 'TWD',
        source: 'twse_listed_stock',
        globalAliases: ['台積電', '2330', '台灣積體電路製造股份有限公司'],
      },
    })
  })
})

describe('tw-catalog-fetch', () => {
  it('fails closed on non-2xx responses', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => [],
    } as Response)

    await expect(fetchTwCatalogSource('twse_listed_stock')).rejects.toThrow(
      'TW catalog source twse_listed_stock failed with HTTP 500',
    )

    fetchMock.mockRestore()
  })

  it('fails closed on empty payloads', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response)

    await expect(fetchTwCatalogSource('twse_listed_stock')).rejects.toThrow(
      'TW catalog source twse_listed_stock returned zero records',
    )

    fetchMock.mockRestore()
  })
})

describe('tw-catalog-pipeline dry-run', () => {
  it('produces a summary without database writes', async () => {
    const fetchMock = createTwCatalogFetchMock()

    const summary = await runTwCatalogDryRunPipeline({ dryRun: true })

    expect(summary.dryRun).toBe(true)
    expect(summary.sources.twse_listed_stock).toEqual({
      fetched: 4,
      valid: 2,
      filtered: 2,
    })
    expect(summary.sources.tpex_otc_stock).toEqual({
      fetched: 2,
      valid: 2,
      filtered: 0,
    })
    expect(summary.sources.twse_listed_etf).toEqual({
      fetched: 6,
      valid: 2,
      filtered: 4,
    })
    expect(summary.records.uniqueSymbols).toBe(6)
    expect(summary.records.byType).toEqual({ equity: 4, etf: 2 })
    expect(summary.records.byAssetClass).toEqual({ equity: 5, bond: 1 })
    expect(summary.wouldCreateAssets).toBe(6)
    expect(summary.wouldCreateAliases).toBeGreaterThan(summary.wouldCreateAssets)
    expect(summary.sampleRecords).toHaveLength(5)
    expect(summary.skippedExamples.length).toBeGreaterThan(0)

    fetchMock.mockRestore()
  })
})
