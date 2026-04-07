export const PORTFOLIO_DISPLAY_CURRENCY_MODES = [
  'portfolio-default',
  'preferred-base',
] as const

export type PortfolioDisplayCurrencyMode = (typeof PORTFOLIO_DISPLAY_CURRENCY_MODES)[number]
