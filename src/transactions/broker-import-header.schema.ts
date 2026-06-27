export const BROKER_IMPORT_HEADER_LABELS = {
  assetName: '股名',
  tradeDate: '日期',
  quantity: '成交股數',
  netAmount: '淨收付',
  price: '成交單價',
  fee: '手續費',
  tradeTax: '交易稅',
  taxAmount: '稅款',
  brokerOrderNo: '委託書號',
  currency: '幣別',
  note: '備註',
} as const

export type BrokerImportField = keyof typeof BROKER_IMPORT_HEADER_LABELS

export const REQUIRED_BROKER_IMPORT_FIELDS = [
  'assetName',
  'tradeDate',
  'quantity',
  'netAmount',
  'price',
  'fee',
  'tradeTax',
  'taxAmount',
  'brokerOrderNo',
  'currency',
] as const satisfies readonly BrokerImportField[]

export const OPTIONAL_BROKER_IMPORT_FIELDS = ['note'] as const satisfies readonly BrokerImportField[]

export type RequiredBrokerImportField = (typeof REQUIRED_BROKER_IMPORT_FIELDS)[number]
export type OptionalBrokerImportField = (typeof OPTIONAL_BROKER_IMPORT_FIELDS)[number]

export function getBrokerImportHeaderLabel(field: BrokerImportField): string {
  return BROKER_IMPORT_HEADER_LABELS[field]
}
