const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g
const MULTI_WHITESPACE_REGEX = /\s+/g

export const ASSET_SYMBOL_REGEX = /^[A-Z0-9][A-Z0-9._:/-]{0,19}$/
export const ASSET_NAME_REGEX = /^[\p{L}\p{N}&().,'+:/\-\s]{1,100}$/u
export const ASSET_SEARCH_REGEX = /^[\p{L}\p{N}&().,'+_:/\-\s]{1,100}$/u

function normalizeLooseText(value: string): string {
  return value
    .replace(CONTROL_CHAR_REGEX, ' ')
    .replace(MULTI_WHITESPACE_REGEX, ' ')
    .trim()
}

export function normalizeAssetSymbolInput(value: string): string {
  return normalizeLooseText(value).toUpperCase()
}

export function normalizeAssetNameInput(value: string): string {
  return normalizeLooseText(value)
}

export function normalizeAssetCurrencyInput(value: string): string {
  return normalizeLooseText(value).toUpperCase()
}

export function normalizeAssetSearchInput(value: string): string {
  return normalizeLooseText(value)
}
