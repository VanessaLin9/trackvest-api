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

function classifyListedEtfFundType(fundType: string | undefined): TwCatalogClassification {
  const normalizedFundType = fundType?.trim() ?? ''
  if (!normalizedFundType) {
    return {
      accepted: false,
      reason: 'missing ETF fund type',
    }
  }

  if (ETN_KEYWORD_REGEX.test(normalizedFundType)) {
    return {
      accepted: false,
      reason: 'ETN is excluded from v1 catalog',
    }
  }

  if (normalizedFundType.includes('債券')) {
    return {
      accepted: true,
      type: 'etf',
      assetClass: 'bond',
    }
  }

  if (normalizedFundType.includes('股票型基金')) {
    return {
      accepted: true,
      type: 'etf',
      assetClass: 'equity',
    }
  }

  return {
    accepted: false,
    reason: 'unrecognized ETF fund type',
  }
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
      if (ETN_KEYWORD_REGEX.test(record.shortName)) {
        return {
          accepted: false,
          reason: 'ETN is excluded from v1 catalog',
        }
      }

      return classifyListedEtfFundType(record.fundType)
    }
    default:
      return {
        accepted: false,
        reason: 'unsupported source',
      }
  }
}
