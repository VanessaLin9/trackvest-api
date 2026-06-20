export const DEMO_USER_ID = '5f9b7d4a-69d4-4a78-98f4-bc82eeac1001'
export const DEMO_USER_EMAIL = 'demo@trackvest.local'
export const BCRYPT_ROUNDS = 10

/** Passwords that are allowed for local dev seed only — never for production demo seed. */
export const DEV_ONLY_DEMO_PASSWORDS = ['demo-password'] as const

export const BANK_ACCOUNT_ID = '497f9b9a-7788-4fb5-93a2-4c8d3f0d5e01'
export const BROKER_ACCOUNT_ID = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'
export const BROKER_USD_ACCOUNT_ID = 'd2d28e54-19e1-42d8-b6f2-9c1e5f8de202'

export const DEMO_ACCOUNT_IDS = [
  BANK_ACCOUNT_ID,
  BROKER_ACCOUNT_ID,
  BROKER_USD_ACCOUNT_ID,
] as const

export const ASSET_IDS = {
  tsmc: '0dc4b8a9-5f72-4bbf-a02d-1c1dd7a9f101',
  yuanta50: 'd60b9d4e-8a57-45da-b2cf-0eb0bb47f102',
  fubon50: 'adfc4a1c-6886-4c17-a4cf-f6d67346f103',
  aseh: '0f1b0eb7-4e4a-4279-8c5b-4f7f4c5bf104',
  mxic: 'd7c74ef1-2fb4-4bcb-82d5-7ac0ab1e7105',
  aapl: '0ef08fef-11d0-4e32-a9ea-07b8b6d8f106',
  sgov: '5f933c3d-fab8-4d3e-86f7-a2e7f6c4f107',
  bndw: '7a0d2e9a-4aa2-4a8f-a730-1f9f6f21f108',
} as const

/** Asset ids referenced by demo-user transactions and positions. */
export const DEMO_CATALOG_ASSET_IDS = Object.values(ASSET_IDS)

export const GL_ACCOUNT_IDS = {
  bankCash: '6bcd6f32-8580-45d2-8ebd-3c40b8822001',
  brokerCash: 'b97dd1ec-cdf0-4f1f-a64b-870863ee2002',
  investment: 'f3b7221f-bb7b-4a2f-b2bb-31a2f1152003',
  equity: 'd792bc25-8359-4ae4-a728-02c3dd912004',
  dividendIncome: '59d6282f-4bc4-49ae-ac44-5dfdb07a2005',
  realizedGain: '1c14df14-2a8a-4166-8f20-301af7ad2006',
  feeExpense: 'f9eb834c-697d-43f8-802e-e698b0df2007',
  realizedLoss: 'be551d55-746d-49d7-9ab8-23ca5b4f2008',
  diningExpense: '1f667430-4063-4379-b23b-78d666d92009',
  travelExpense: '5d3d54b5-d72f-4780-a516-75bc4bc02010',
} as const

export { resolveDevDemoUserPassword, resolveProductionDemoUserPassword } from './demo-password'
