export const SUPPORTED_CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR'] as const

export const APP_CURRENCIES = ['TWD', 'USD'] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
export type AppCurrency = (typeof APP_CURRENCIES)[number]
