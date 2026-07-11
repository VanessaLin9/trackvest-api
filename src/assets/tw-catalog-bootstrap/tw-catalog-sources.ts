import type { TwCatalogSourceConfig } from './tw-catalog-bootstrap.types'

export const TW_CATALOG_SOURCES: TwCatalogSourceConfig[] = [
  {
    id: 'twse_listed_stock',
    label: 'TWSE listed stocks',
    url: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
  },
  {
    id: 'tpex_otc_stock',
    label: 'TPEX OTC stocks',
    url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O',
  },
  {
    id: 'twse_listed_etf',
    label: 'TWSE listed ETFs',
    url: 'https://openapi.twse.com.tw/v1/opendata/t187ap47_L',
  },
]

export function getTwCatalogSourceById(id: TwCatalogSourceConfig['id']): TwCatalogSourceConfig {
  const source = TW_CATALOG_SOURCES.find((entry) => entry.id === id)
  if (!source) {
    throw new Error(`Unknown TW catalog source: ${id}`)
  }
  return source
}
