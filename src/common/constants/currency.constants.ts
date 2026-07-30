/** Prisma Currency enum 全集；資產／帳戶可選幣別（PR #9）。 */
export const SUPPORTED_CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR'] as const

/** App 估值／displayCurrency 目前追蹤的幣別（PR #9／#11）。 */
export const APP_CURRENCIES = ['TWD', 'USD'] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
export type AppCurrency = (typeof APP_CURRENCIES)[number]
