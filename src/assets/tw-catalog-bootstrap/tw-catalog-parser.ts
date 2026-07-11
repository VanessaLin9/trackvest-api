import type { TwCatalogRawRecord, TwCatalogSourceId } from './tw-catalog-bootstrap.types'

function readStringField(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }
  return null
}

export function parseTwCatalogRow(
  source: TwCatalogSourceId,
  row: Record<string, unknown>,
): TwCatalogRawRecord | null {
  switch (source) {
    case 'twse_listed_stock': {
      const symbol = readStringField(row, ['公司代號'])
      const shortName = readStringField(row, ['公司簡稱'])
      const fullName = readStringField(row, ['公司名稱']) ?? undefined
      if (!symbol || !shortName) {
        return null
      }
      return { source, symbol, shortName, fullName }
    }
    case 'tpex_otc_stock': {
      const symbol = readStringField(row, ['SecuritiesCompanyCode'])
      const shortName = readStringField(row, ['CompanyAbbreviation'])
      const fullName = readStringField(row, ['CompanyName']) ?? undefined
      if (!symbol || !shortName) {
        return null
      }
      return { source, symbol, shortName, fullName }
    }
    case 'twse_listed_etf': {
      const symbol = readStringField(row, ['基金代號'])
      const shortName = readStringField(row, ['基金簡稱'])
      const fundType = readStringField(row, ['基金類型']) ?? undefined
      if (!symbol || !shortName) {
        return null
      }
      return { source, symbol, shortName, fundType }
    }
    default:
      return null
  }
}

export function parseTwCatalogSourceRows(
  source: TwCatalogSourceId,
  rows: Record<string, unknown>[],
): { parsed: TwCatalogRawRecord[]; filtered: number } {
  const parsed: TwCatalogRawRecord[] = []
  let filtered = 0

  for (const row of rows) {
    const record = parseTwCatalogRow(source, row)
    if (!record) {
      filtered += 1
      continue
    }
    parsed.push(record)
  }

  return { parsed, filtered }
}
