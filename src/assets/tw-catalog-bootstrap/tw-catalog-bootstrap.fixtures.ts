export const TWSE_LISTED_STOCK_FIXTURE = [
  {
    公司代號: '1101',
    公司名稱: '臺灣水泥股份有限公司',
    公司簡稱: '台泥',
    產業別: '01',
  },
  {
    公司代號: '2330',
    公司名稱: '台灣積體電路製造股份有限公司',
    公司簡稱: '台積電',
    產業別: '24',
  },
  {
    公司代號: 'BAD',
    公司名稱: 'Invalid Symbol Example',
    公司簡稱: 'Invalid',
    產業別: '01',
  },
  {
    公司代號: '9999',
    公司名稱: 'Missing Short Name Co',
    公司簡稱: '',
    產業別: '01',
  },
]

export const TPEX_OTC_STOCK_FIXTURE = [
  {
    SecuritiesCompanyCode: '1240',
    CompanyName: '茂生農經股份有限公司',
    CompanyAbbreviation: '茂生農經',
  },
  {
    SecuritiesCompanyCode: '8069',
    CompanyName: '元太科技工業股份有限公司',
    CompanyAbbreviation: '元太',
  },
]

export const TWSE_LISTED_ETF_FIXTURE = [
  {
    基金代號: '0050',
    基金簡稱: '元大台灣50',
    基金類型: '國內成分證券指數股票型基金',
  },
  {
    基金代號: '00937B',
    基金簡稱: '群益台灣ESG債',
    基金類型: '國內債券指數股票型基金',
  },
  {
    基金代號: '02001',
    基金簡稱: '元大台灣價值高息ETN',
    基金類型: '國內ETN',
  },
  {
    基金代號: '00713',
    基金簡稱: '',
    基金類型: '國內成分證券指數股票型基金',
  },
  {
    基金代號: '00888',
    基金簡稱: '缺基金類型',
    基金類型: '',
  },
  {
    基金代號: '00889',
    基金簡稱: '未知類型ETF',
    基金類型: '其他不確定類型',
  },
]

export const TW_CATALOG_FIXTURE_URLS: Record<string, unknown[]> = {
  'https://openapi.twse.com.tw/v1/opendata/t187ap03_L': TWSE_LISTED_STOCK_FIXTURE,
  'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O': TPEX_OTC_STOCK_FIXTURE,
  'https://openapi.twse.com.tw/v1/opendata/t187ap47_L': TWSE_LISTED_ETF_FIXTURE,
}

export function createTwCatalogFetchMock() {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const fixture = TW_CATALOG_FIXTURE_URLS[url]

    if (!fixture) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response
    }

    return {
      ok: true,
      status: 200,
      json: async () => fixture,
    } as Response
  })
}
