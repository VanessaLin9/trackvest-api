export const APP_CURRENCIES = ['TWD', 'USD'] as const

export type AppCurrency = (typeof APP_CURRENCIES)[number]
