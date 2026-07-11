import type { TwCatalogRawRecord } from './tw-catalog-bootstrap.types'

const LISTED_STOCK_SYMBOL_REGEX = /^\d+$/
const LISTED_ETF_SYMBOL_REGEX = /^\d+[A-Z]?$/
const ETN_KEYWORD_REGEX = /ETN/i

export type TwCatalogClassification =
  | {
      accepted: true
      type: 'equity' | 'etf'
      assetClass: 'equity' | 'bond'
    }
  | {
      accepted: false
      reason: string
    }

function isValidSymbol(record: TwCatalogRawRecord): boolean {
  if (record.source === 'twse_listed_etf') {
    return LISTED_ETF_SYMBOL_REGEX.test(record.symbol)
  }
  return LISTED_STOCK_SYMBOL_REGEX.test(record.symbol)
}

export function classifyTwCatalogRecord(record: TwCatalogRawRecord): TwCatalogClassification {
  if (!isValidSymbol(record)) {
    return {
      accepted: false,
      reason: 'symbol format is not supported for this source',
    }
  }

  switch (record.source) {
    case 'twse_listed_stock':
    case 'tpex_otc_stock':
      return {
        accepted: true,
        type: 'equity',
        assetClass: 'equity',
      }
    case 'twse_listed_etf': {
      const fundType = record.fundType ?? ''
      if (ETN_KEYWORD_REGEX.test(fundType) || ETN_KEYWORD_REGEX.test(record.shortName)) {
        return {
          accepted: false,
          reason: 'ETN is excluded from v1 catalog',
        }
      }

      const assetClass = fundType.includes('債券') ? 'bond' : 'equity'
      return {
        accepted: true,
        type: 'etf',
        assetClass,
      }
    }
    default:
      return {
        accepted: false,
        reason: 'unsupported source',
      }
  }
}
