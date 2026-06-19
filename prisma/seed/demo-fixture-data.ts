import { GlAccountPurpose } from '@prisma/client'
import {
  ASSET_IDS,
  BANK_ACCOUNT_ID,
  BROKER_ACCOUNT_ID,
  BROKER_USD_ACCOUNT_ID,
  GL_ACCOUNT_IDS,
} from './demo-identity'

export const TRANSACTION_IDS = {
  depositBroker: '675676e8-3f24-4cbc-b210-b5efea213001',
  buyYuanta50Lot1: '4df6b893-c1c0-4d99-aaf3-ebf79b863002',
  buyYuanta50Lot2: '6de8e1ec-9f1a-4e88-983f-c4d400953003',
  sellYuanta50PreSplit: 'e6f7ecf7-bf11-4f48-b80f-af6c7d1f3004',
  sellYuanta50PostSplit: 'a1b2c3d4-1111-4222-8333-444455560014',
  buyYuanta50PostSplit: 'b2c3d4e5-2222-4333-9444-555566670015',
  buyTsmc: '97efded6-3c65-4247-a8c9-31d4aaed3005',
  dividendTsmc: 'c8d77c1e-e276-4ae9-8ed6-c2f359f43006',
  buySgov: 'a92f36f1-0455-4c8f-8b29-0b6a31623007',
  buyAapl: '4bd7c6f0-d257-4f9c-8cd9-8d5cbde83008',
  buyBndw: '6abf7284-4fd7-483b-b5a4-8712f75d3009',
} as const

export const POSITION_IDS = {
  yuanta50: '1791f0ad-7fc5-4d38-b6b0-30225d3c4001',
  tsmc: '5b153bb1-2fed-4a52-9435-df5b389c4002',
  sgov: '6f4f6f43-729d-47d4-9f86-b5bc5e72c403',
  aapl: 'e6a67a2b-2933-4d57-9ce4-d3db3155c404',
  bndw: '6f3ed5ef-9a10-4fc7-9fd8-2f6c3155c405',
} as const

export const LOT_IDS = {
  yuanta50Lot1: '62955b50-bcb6-4707-bb83-12e195a55001',
  yuanta50Lot2: 'a758bf8b-f4d1-4d6f-a29c-2a7f17765002',
  yuanta50Lot3: 'c3d4e5f6-3333-4444-a555-666677780016',
  tsmcLot1: 'f8f2cf31-a8bc-4ef7-8d5d-85b6dc6d5003',
  sgovLot1: '9b9b2eef-7cc6-4fd3-a6de-a74506a65004',
  aaplLot1: '1b86f70b-c782-4b1b-97d1-d546f43d5005',
  bndwLot1: '2e96f70b-c782-4b1b-97d1-d546f43d5006',
} as const

export const SELL_MATCH_IDS = {
  yuanta50PreLot1: '5b100242-ec32-4b11-bff5-09a9a34f6001',
  yuanta50PostLot1: 'b1410ef7-5486-4614-b89f-9e86b2526002',
  yuanta50PostLot2: 'd2521fa8-6597-4725-9ac0-af97c3637003',
} as const

export const GL_ENTRY_IDS = {
  depositBroker: 'aa8ab17f-f599-4f3f-bb7d-9fd8c85f7001',
  buyYuanta50Lot1: 'ea0d111c-8061-414b-a30a-af7b9d857002',
  buyYuanta50Lot2: '2a7f25be-e16b-4468-83f9-51bd73a67003',
  sellYuanta50PreSplit: '3668d8c6-63b5-4d95-a4d2-e26a23857004',
  sellYuanta50PostSplit: '4779e9d7-74c6-5ea6-b5e3-f37b34968105',
  buyYuanta50PostSplit: '5880fae8-85d7-6fb7-c6f4-048c45a79206',
  buyTsmc: 'b74a55e1-80f0-41a3-9c09-a7428a027005',
  dividendTsmc: '31c1480d-7d43-4cc1-a31a-f58171be7006',
} as const

export const GL_LINE_IDS = {
  depositBrokerBrokerCash: 'c1000001-0001-4000-8000-000000000001',
  depositBrokerEquity: 'c1000001-0001-4000-8000-000000000002',
  buyYuanta50Lot1Investment: 'c1000001-0001-4000-8000-000000000003',
  buyYuanta50Lot1BrokerCash: 'c1000001-0001-4000-8000-000000000004',
  buyYuanta50Lot2Investment: 'c1000001-0001-4000-8000-000000000005',
  buyYuanta50Lot2BrokerCash: 'c1000001-0001-4000-8000-000000000006',
  sellYuanta50PreSplitBrokerCash: 'c1000001-0001-4000-8000-000000000007',
  sellYuanta50PreSplitInvestment: 'c1000001-0001-4000-8000-000000000008',
  sellYuanta50PreSplitFee: 'c1000001-0001-4000-8000-000000000009',
  sellYuanta50PreSplitLoss: 'c1000001-0001-4000-8000-000000000010',
  sellYuanta50PostSplitBrokerCash: 'c1000001-0001-4000-8000-000000000011',
  sellYuanta50PostSplitInvestment: 'c1000001-0001-4000-8000-000000000012',
  sellYuanta50PostSplitFee: 'c1000001-0001-4000-8000-000000000013',
  sellYuanta50PostSplitLoss: 'c1000001-0001-4000-8000-000000000014',
  buyYuanta50PostSplitInvestment: 'c1000001-0001-4000-8000-000000000015',
  buyYuanta50PostSplitBrokerCash: 'c1000001-0001-4000-8000-000000000016',
  buyTsmcInvestment: 'c1000001-0001-4000-8000-000000000017',
  buyTsmcBrokerCash: 'c1000001-0001-4000-8000-000000000018',
  dividendTsmcBrokerCash: 'c1000001-0001-4000-8000-000000000019',
  dividendTsmcIncome: 'c1000001-0001-4000-8000-000000000020',
} as const

/** Demo TWD broker initial deposit date (before first 0050 buy on 2025-03-03). */
export const BROKER_TWD_DEPOSIT_DATE = '2025-03-01'

export const YUANTA50_FINMIND_CLOSES = {
  buyLot1: { tradeDate: '2025-03-03', close: 188.05 },
  buyLot2: { tradeDate: '2025-03-10', close: 185.25 },
  sellPreSplit: { tradeDate: '2025-05-20', close: 180.8 },
  sellPostSplit: { tradeDate: '2025-07-02', close: 48.65 },
  buyPostSplit: { tradeDate: '2025-07-10', close: 49.41 },
  latestDemo: { asOf: '2026-06-03', close: 107.6 },
} as const

export const YUANTA50_UNIT_COSTS = {
  lot1: 188.25,
  lot2: 185.45,
  lot3: 49.91,
} as const

export function buildSeedPrice(input: {
  assetId: string
  asOf: string
  close: number
  volume?: number
}) {
  const spread = Number((input.close * 0.008).toFixed(2))
  return {
    assetId: input.assetId,
    asOf: new Date(`${input.asOf}T00:00:00.000Z`),
    source: 'seed',
    price: input.close,
    open: input.close - 0.5,
    high: input.close + 0.8,
    low: input.close - 1.2,
    volume: input.volume ?? 1_000_000,
    turnoverAmount: input.close * (input.volume ?? 1_000_000),
    changeRate: spread,
    tradeCount: 10_000,
  }
}

export function getCatalogAssetsData() {
  return [
    { id: ASSET_IDS.tsmc, symbol: '2330', name: '台積電', type: 'equity' as const, assetClass: 'equity' as const, baseCurrency: 'TWD' },
    { id: ASSET_IDS.yuanta50, symbol: '0050', name: '元大台灣50', type: 'etf' as const, assetClass: 'equity' as const, baseCurrency: 'TWD' },
    { id: ASSET_IDS.fubon50, symbol: '006208', name: '富邦台50', type: 'etf' as const, assetClass: 'equity' as const, baseCurrency: 'TWD' },
    { id: ASSET_IDS.aseh, symbol: '3711', name: '日月光投控', type: 'equity' as const, assetClass: 'equity' as const, baseCurrency: 'TWD' },
    { id: ASSET_IDS.mxic, symbol: '2337', name: '旺宏', type: 'equity' as const, assetClass: 'equity' as const, baseCurrency: 'TWD' },
    { id: ASSET_IDS.aapl, symbol: 'AAPL', name: 'Apple Inc.', type: 'equity' as const, assetClass: 'equity' as const, baseCurrency: 'USD' },
    {
      id: ASSET_IDS.sgov,
      symbol: 'SGOV',
      name: 'iShares 0-3 Month Treasury Bond ETF',
      type: 'etf' as const,
      assetClass: 'bond' as const,
      baseCurrency: 'USD',
    },
    {
      id: ASSET_IDS.bndw,
      symbol: 'BNDW',
      name: 'Vanguard Total World Bond ETF',
      type: 'etf' as const,
      assetClass: 'bond' as const,
      baseCurrency: 'USD',
    },
  ]
}

export function getCatalogAssetAliasesData() {
  return [
    { assetId: ASSET_IDS.tsmc, alias: '台積電', broker: '' },
    { assetId: ASSET_IDS.yuanta50, alias: '元大台灣50', broker: '' },
    { assetId: ASSET_IDS.yuanta50, alias: '台灣50', broker: '' },
    { assetId: ASSET_IDS.fubon50, alias: '富邦台50', broker: '' },
    { assetId: ASSET_IDS.aseh, alias: '日月光投控', broker: '' },
    { assetId: ASSET_IDS.mxic, alias: '旺宏', broker: '' },
    { assetId: ASSET_IDS.yuanta50, alias: '國泰台灣領袖50', broker: 'cathay' },
    { assetId: ASSET_IDS.aapl, alias: 'Apple', broker: '' },
    { assetId: ASSET_IDS.sgov, alias: '美債 ETF', broker: '' },
    { assetId: ASSET_IDS.sgov, alias: '短天期美債', broker: '' },
    { assetId: ASSET_IDS.bndw, alias: '全球債券 ETF', broker: '' },
    { assetId: ASSET_IDS.bndw, alias: '全球債券', broker: '' },
  ]
}

export function getCatalogPricesData() {
  return [
    buildSeedPrice({
      assetId: ASSET_IDS.yuanta50,
      asOf: YUANTA50_FINMIND_CLOSES.buyLot1.tradeDate,
      close: YUANTA50_FINMIND_CLOSES.buyLot1.close,
    }),
    buildSeedPrice({
      assetId: ASSET_IDS.yuanta50,
      asOf: YUANTA50_FINMIND_CLOSES.buyLot2.tradeDate,
      close: YUANTA50_FINMIND_CLOSES.buyLot2.close,
    }),
    buildSeedPrice({
      assetId: ASSET_IDS.yuanta50,
      asOf: YUANTA50_FINMIND_CLOSES.sellPreSplit.tradeDate,
      close: YUANTA50_FINMIND_CLOSES.sellPreSplit.close,
    }),
    buildSeedPrice({
      assetId: ASSET_IDS.yuanta50,
      asOf: YUANTA50_FINMIND_CLOSES.sellPostSplit.tradeDate,
      close: YUANTA50_FINMIND_CLOSES.sellPostSplit.close,
    }),
    buildSeedPrice({
      assetId: ASSET_IDS.yuanta50,
      asOf: YUANTA50_FINMIND_CLOSES.buyPostSplit.tradeDate,
      close: YUANTA50_FINMIND_CLOSES.buyPostSplit.close,
    }),
    buildSeedPrice({
      assetId: ASSET_IDS.yuanta50,
      asOf: YUANTA50_FINMIND_CLOSES.latestDemo.asOf,
      close: YUANTA50_FINMIND_CLOSES.latestDemo.close,
    }),
    buildSeedPrice({ assetId: ASSET_IDS.tsmc, asOf: '2026-03-20', close: 1000 }),
    buildSeedPrice({ assetId: ASSET_IDS.tsmc, asOf: '2026-03-27', close: 1080 }),
    {
      assetId: ASSET_IDS.fubon50,
      price: 112,
      asOf: new Date('2026-03-27T09:00:00.000Z'),
      source: 'seed',
    },
    {
      assetId: ASSET_IDS.sgov,
      price: 100.45,
      asOf: new Date('2026-03-27T09:00:00.000Z'),
      source: 'seed',
    },
    {
      assetId: ASSET_IDS.aapl,
      price: 212.3,
      asOf: new Date('2026-03-27T09:00:00.000Z'),
      source: 'seed',
    },
    {
      assetId: ASSET_IDS.bndw,
      price: 68.9,
      asOf: new Date('2026-03-27T09:00:00.000Z'),
      source: 'seed',
    },
  ]
}

export function getCatalogFxRatesData() {
  return [
    {
      base: 'USD',
      quote: 'TWD',
      rate: 32.15,
      asOf: new Date('2026-03-27T00:00:00.000Z'),
    },
    {
      base: 'TWD',
      quote: 'USD',
      rate: 0.0311042,
      asOf: new Date('2026-03-27T00:00:00.000Z'),
    },
  ]
}

export function getDemoAccountsData(userId: string) {
  return [
    {
      id: BANK_ACCOUNT_ID,
      userId,
      name: 'Bank TWD',
      type: 'bank' as const,
      currency: 'TWD' as const,
    },
    {
      id: BROKER_ACCOUNT_ID,
      userId,
      name: 'Broker TWD',
      type: 'broker' as const,
      currency: 'TWD' as const,
      broker: 'cathay',
    },
    {
      id: BROKER_USD_ACCOUNT_ID,
      userId,
      name: 'Broker USD',
      type: 'broker' as const,
      currency: 'USD' as const,
      broker: 'ib',
    },
  ]
}

export function getDemoGlAccountsData(userId: string) {
  return [
    {
      id: GL_ACCOUNT_IDS.bankCash,
      userId,
      name: '資產-銀行(台幣)',
      type: 'asset' as const,
      currency: 'TWD' as const,
      linkedAccountId: BANK_ACCOUNT_ID,
    },
    {
      id: GL_ACCOUNT_IDS.brokerCash,
      userId,
      name: '資產-券商現金(台幣)',
      type: 'asset' as const,
      currency: 'TWD' as const,
      linkedAccountId: BROKER_ACCOUNT_ID,
    },
    {
      id: GL_ACCOUNT_IDS.investment,
      userId,
      name: '資產-投資-股票(台幣)',
      type: 'asset' as const,
      purpose: GlAccountPurpose.investment_bucket,
      currency: 'TWD' as const,
    },
    {
      id: GL_ACCOUNT_IDS.equity,
      userId,
      name: '權益-投入資本',
      type: 'equity' as const,
      purpose: GlAccountPurpose.equity_contribution,
      currency: 'TWD' as const,
    },
    {
      id: GL_ACCOUNT_IDS.dividendIncome,
      userId,
      name: '收入-股利',
      type: 'income' as const,
      purpose: GlAccountPurpose.dividend_income,
      currency: 'TWD' as const,
    },
    {
      id: GL_ACCOUNT_IDS.realizedGain,
      userId,
      name: '收入-已實現損益-收益',
      type: 'income' as const,
      purpose: GlAccountPurpose.realized_gain_income,
      currency: 'TWD' as const,
    },
    {
      id: GL_ACCOUNT_IDS.feeExpense,
      userId,
      name: '費用-手續費',
      type: 'expense' as const,
      purpose: GlAccountPurpose.fee_expense,
      currency: 'TWD' as const,
    },
    {
      id: GL_ACCOUNT_IDS.realizedLoss,
      userId,
      name: '費用-已實現損益-損失',
      type: 'expense' as const,
      purpose: GlAccountPurpose.realized_loss_expense,
      currency: 'TWD' as const,
    },
    {
      id: GL_ACCOUNT_IDS.diningExpense,
      userId,
      name: '費用-餐飲',
      type: 'expense' as const,
      currency: 'TWD' as const,
    },
    {
      id: GL_ACCOUNT_IDS.travelExpense,
      userId,
      name: '費用-交通',
      type: 'expense' as const,
      currency: 'TWD' as const,
    },
  ]
}

export function getDemoTransactionsData() {
  return [
    {
      id: TRANSACTION_IDS.depositBroker,
      accountId: BROKER_ACCOUNT_ID,
      type: 'deposit' as const,
      amount: 200000,
      fee: 0,
      tax: 0,
      tradeTime: new Date(`${BROKER_TWD_DEPOSIT_DATE}T09:00:00.000Z`),
      note: '初始入金',
    },
    {
      id: TRANSACTION_IDS.buyYuanta50Lot1,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      type: 'buy' as const,
      amount: 18825,
      quantity: 100,
      price: YUANTA50_FINMIND_CLOSES.buyLot1.close,
      fee: 20,
      tax: 0,
      brokerOrderNo: 'D202503030001',
      tradeTime: new Date('2025-03-03T09:00:00.000Z'),
      note: '0050 首批建倉（100 股，分割前 FinMind 收盤價）',
    },
    {
      id: TRANSACTION_IDS.buyYuanta50Lot2,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      type: 'buy' as const,
      amount: 9272.5,
      quantity: 50,
      price: YUANTA50_FINMIND_CLOSES.buyLot2.close,
      fee: 10,
      tax: 0,
      brokerOrderNo: 'D202503100001',
      tradeTime: new Date('2025-03-10T09:00:00.000Z'),
      note: '0050 逢低加碼（50 股，分割前 FinMind 收盤價）',
    },
    {
      id: TRANSACTION_IDS.sellYuanta50PreSplit,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      type: 'sell' as const,
      amount: 14428,
      quantity: 80,
      price: YUANTA50_FINMIND_CLOSES.sellPreSplit.close,
      fee: 20,
      tax: 16,
      brokerOrderNo: 'D202505200001',
      tradeTime: new Date('2025-05-20T09:00:00.000Z'),
      note: '0050 分割前減碼（80 股）',
    },
    {
      id: TRANSACTION_IDS.sellYuanta50PostSplit,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      type: 'sell' as const,
      amount: 1919,
      quantity: 40,
      price: YUANTA50_FINMIND_CLOSES.sellPostSplit.close,
      fee: 15,
      tax: 12,
      brokerOrderNo: 'D202507020001',
      tradeTime: new Date('2025-07-02T09:00:00.000Z'),
      note: '0050 分割後減碼（40 股，broker 登錄股數）',
    },
    {
      id: TRANSACTION_IDS.buyYuanta50PostSplit,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      type: 'buy' as const,
      amount: 998.2,
      quantity: 20,
      price: YUANTA50_FINMIND_CLOSES.buyPostSplit.close,
      fee: 10,
      tax: 0,
      brokerOrderNo: 'D202507100001',
      tradeTime: new Date('2025-07-10T09:00:00.000Z'),
      note: '0050 分割後加碼（20 股）',
    },
    {
      id: TRANSACTION_IDS.buyTsmc,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.tsmc,
      type: 'buy' as const,
      amount: 20020,
      quantity: 20,
      price: 1000,
      fee: 20,
      tax: 0,
      brokerOrderNo: 'D202603200001',
      tradeTime: new Date('2026-03-20T09:00:00.000Z'),
      note: '台積電長期配置（20 股）',
    },
    {
      id: TRANSACTION_IDS.dividendTsmc,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.tsmc,
      type: 'dividend' as const,
      amount: 600,
      fee: 0,
      tax: 0,
      tradeTime: new Date('2026-03-25T09:00:00.000Z'),
      note: '台積電股利入帳',
    },
    {
      id: TRANSACTION_IDS.buySgov,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.sgov,
      type: 'buy' as const,
      amount: 2004,
      quantity: 20,
      price: 100.1,
      fee: 2,
      tax: 0,
      brokerOrderNo: 'US202603120001',
      tradeTime: new Date('2026-03-12T13:30:00.000Z'),
      note: '美債 ETF 停泊資金',
    },
    {
      id: TRANSACTION_IDS.buyAapl,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.aapl,
      type: 'buy' as const,
      amount: 1588,
      quantity: 8,
      price: 198.5,
      fee: 0,
      tax: 0,
      brokerOrderNo: 'US202603210001',
      tradeTime: new Date('2026-03-21T13:30:00.000Z'),
      note: 'Apple 長期配置',
    },
    {
      id: TRANSACTION_IDS.buyBndw,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.bndw,
      type: 'buy' as const,
      amount: 1026,
      quantity: 15,
      price: 68.4,
      fee: 0,
      tax: 0,
      brokerOrderNo: 'US202603240001',
      tradeTime: new Date('2026-03-24T13:30:00.000Z'),
      note: '全球債券配置',
    },
  ]
}

export function getDemoPositionsData() {
  return [
    {
      id: POSITION_IDS.yuanta50,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      quantity: 50,
      avgCost: 131.23,
      openedAt: new Date('2025-03-03T09:00:00.000Z'),
    },
    {
      id: POSITION_IDS.tsmc,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.tsmc,
      quantity: 20,
      avgCost: 1001,
      openedAt: new Date('2026-03-20T09:00:00.000Z'),
    },
    {
      id: POSITION_IDS.sgov,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.sgov,
      quantity: 20,
      avgCost: 100.2,
      openedAt: new Date('2026-03-12T13:30:00.000Z'),
    },
    {
      id: POSITION_IDS.aapl,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.aapl,
      quantity: 8,
      avgCost: 198.5,
      openedAt: new Date('2026-03-21T13:30:00.000Z'),
    },
    {
      id: POSITION_IDS.bndw,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.bndw,
      quantity: 15,
      avgCost: 68.4,
      openedAt: new Date('2026-03-24T13:30:00.000Z'),
    },
  ]
}

export function getDemoPositionLotsData() {
  return [
    {
      id: LOT_IDS.yuanta50Lot1,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      sourceTransactionId: TRANSACTION_IDS.buyYuanta50Lot1,
      originalQuantity: 100,
      remainingQuantity: 0,
      unitCost: YUANTA50_UNIT_COSTS.lot1,
      openedAt: new Date('2025-03-03T09:00:00.000Z'),
      closedAt: new Date('2025-07-02T09:00:00.000Z'),
    },
    {
      id: LOT_IDS.yuanta50Lot2,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      sourceTransactionId: TRANSACTION_IDS.buyYuanta50Lot2,
      originalQuantity: 50,
      remainingQuantity: 30,
      unitCost: YUANTA50_UNIT_COSTS.lot2,
      openedAt: new Date('2025-03-10T09:00:00.000Z'),
    },
    {
      id: LOT_IDS.yuanta50Lot3,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.yuanta50,
      sourceTransactionId: TRANSACTION_IDS.buyYuanta50PostSplit,
      originalQuantity: 20,
      remainingQuantity: 20,
      unitCost: YUANTA50_UNIT_COSTS.lot3,
      openedAt: new Date('2025-07-10T09:00:00.000Z'),
    },
    {
      id: LOT_IDS.tsmcLot1,
      accountId: BROKER_ACCOUNT_ID,
      assetId: ASSET_IDS.tsmc,
      sourceTransactionId: TRANSACTION_IDS.buyTsmc,
      originalQuantity: 20,
      remainingQuantity: 20,
      unitCost: 1001,
      openedAt: new Date('2026-03-20T09:00:00.000Z'),
    },
    {
      id: LOT_IDS.sgovLot1,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.sgov,
      sourceTransactionId: TRANSACTION_IDS.buySgov,
      originalQuantity: 20,
      remainingQuantity: 20,
      unitCost: 100.2,
      openedAt: new Date('2026-03-12T13:30:00.000Z'),
    },
    {
      id: LOT_IDS.aaplLot1,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.aapl,
      sourceTransactionId: TRANSACTION_IDS.buyAapl,
      originalQuantity: 8,
      remainingQuantity: 8,
      unitCost: 198.5,
      openedAt: new Date('2026-03-21T13:30:00.000Z'),
    },
    {
      id: LOT_IDS.bndwLot1,
      accountId: BROKER_USD_ACCOUNT_ID,
      assetId: ASSET_IDS.bndw,
      sourceTransactionId: TRANSACTION_IDS.buyBndw,
      originalQuantity: 15,
      remainingQuantity: 15,
      unitCost: 68.4,
      openedAt: new Date('2026-03-24T13:30:00.000Z'),
    },
  ]
}

export function getDemoSellLotMatchesData() {
  return [
    {
      id: SELL_MATCH_IDS.yuanta50PreLot1,
      sellTransactionId: TRANSACTION_IDS.sellYuanta50PreSplit,
      buyLotId: LOT_IDS.yuanta50Lot1,
      quantity: 80,
      unitCost: YUANTA50_UNIT_COSTS.lot1,
    },
    {
      id: SELL_MATCH_IDS.yuanta50PostLot1,
      sellTransactionId: TRANSACTION_IDS.sellYuanta50PostSplit,
      buyLotId: LOT_IDS.yuanta50Lot1,
      quantity: 20,
      unitCost: YUANTA50_UNIT_COSTS.lot1,
    },
    {
      id: SELL_MATCH_IDS.yuanta50PostLot2,
      sellTransactionId: TRANSACTION_IDS.sellYuanta50PostSplit,
      buyLotId: LOT_IDS.yuanta50Lot2,
      quantity: 20,
      unitCost: YUANTA50_UNIT_COSTS.lot2,
    },
  ]
}

export function getDemoGlEntriesData(userId: string) {
  return [
    {
      id: GL_ENTRY_IDS.depositBroker,
      userId,
      date: new Date(`${BROKER_TWD_DEPOSIT_DATE}T09:00:00.000Z`),
      memo: '初始入金',
      source: 'auto:transaction:deposit',
      refTxId: TRANSACTION_IDS.depositBroker,
    },
    {
      id: GL_ENTRY_IDS.buyYuanta50Lot1,
      userId,
      date: new Date('2025-03-03T09:00:00.000Z'),
      memo: '0050 首批建倉',
      source: 'auto:transaction:buy',
      refTxId: TRANSACTION_IDS.buyYuanta50Lot1,
    },
    {
      id: GL_ENTRY_IDS.buyYuanta50Lot2,
      userId,
      date: new Date('2025-03-10T09:00:00.000Z'),
      memo: '0050 逢低加碼',
      source: 'auto:transaction:buy',
      refTxId: TRANSACTION_IDS.buyYuanta50Lot2,
    },
    {
      id: GL_ENTRY_IDS.sellYuanta50PreSplit,
      userId,
      date: new Date('2025-05-20T09:00:00.000Z'),
      memo: '0050 分割前減碼',
      source: 'auto:transaction:sell',
      refTxId: TRANSACTION_IDS.sellYuanta50PreSplit,
    },
    {
      id: GL_ENTRY_IDS.sellYuanta50PostSplit,
      userId,
      date: new Date('2025-07-02T09:00:00.000Z'),
      memo: '0050 分割後減碼',
      source: 'auto:transaction:sell',
      refTxId: TRANSACTION_IDS.sellYuanta50PostSplit,
    },
    {
      id: GL_ENTRY_IDS.buyYuanta50PostSplit,
      userId,
      date: new Date('2025-07-10T09:00:00.000Z'),
      memo: '0050 分割後加碼',
      source: 'auto:transaction:buy',
      refTxId: TRANSACTION_IDS.buyYuanta50PostSplit,
    },
    {
      id: GL_ENTRY_IDS.buyTsmc,
      userId,
      date: new Date('2026-03-20T09:00:00.000Z'),
      memo: '台積電長期配置',
      source: 'auto:transaction:buy',
      refTxId: TRANSACTION_IDS.buyTsmc,
    },
    {
      id: GL_ENTRY_IDS.dividendTsmc,
      userId,
      date: new Date('2026-03-25T09:00:00.000Z'),
      memo: '台積電股利入帳',
      source: 'auto:transaction:dividend',
      refTxId: TRANSACTION_IDS.dividendTsmc,
    },
  ]
}

export function getDemoGlLinesData() {
  return [
    {
      id: GL_LINE_IDS.depositBrokerBrokerCash,
      entryId: GL_ENTRY_IDS.depositBroker,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 200000,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'deposit in',
    },
    {
      id: GL_LINE_IDS.depositBrokerEquity,
      entryId: GL_ENTRY_IDS.depositBroker,
      glAccountId: GL_ACCOUNT_IDS.equity,
      amount: 200000,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'owner contribution',
    },
    {
      id: GL_LINE_IDS.buyYuanta50Lot1Investment,
      entryId: GL_ENTRY_IDS.buyYuanta50Lot1,
      glAccountId: GL_ACCOUNT_IDS.investment,
      amount: 18825,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'buy cost(+fee)',
    },
    {
      id: GL_LINE_IDS.buyYuanta50Lot1BrokerCash,
      entryId: GL_ENTRY_IDS.buyYuanta50Lot1,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 18825,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'cash out',
    },
    {
      id: GL_LINE_IDS.buyYuanta50Lot2Investment,
      entryId: GL_ENTRY_IDS.buyYuanta50Lot2,
      glAccountId: GL_ACCOUNT_IDS.investment,
      amount: 9272.5,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'buy cost(+fee)',
    },
    {
      id: GL_LINE_IDS.buyYuanta50Lot2BrokerCash,
      entryId: GL_ENTRY_IDS.buyYuanta50Lot2,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 9272.5,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'cash out',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PreSplitBrokerCash,
      entryId: GL_ENTRY_IDS.sellYuanta50PreSplit,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 14428,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'sell proceeds in',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PreSplitInvestment,
      entryId: GL_ENTRY_IDS.sellYuanta50PreSplit,
      glAccountId: GL_ACCOUNT_IDS.investment,
      amount: 15060,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'sell cost basis out',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PreSplitFee,
      entryId: GL_ENTRY_IDS.sellYuanta50PreSplit,
      glAccountId: GL_ACCOUNT_IDS.feeExpense,
      amount: 36,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'sell fee and tax',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PreSplitLoss,
      entryId: GL_ENTRY_IDS.sellYuanta50PreSplit,
      glAccountId: GL_ACCOUNT_IDS.realizedLoss,
      amount: 668,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'realized loss',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PostSplitBrokerCash,
      entryId: GL_ENTRY_IDS.sellYuanta50PostSplit,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 1919,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'sell proceeds in',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PostSplitInvestment,
      entryId: GL_ENTRY_IDS.sellYuanta50PostSplit,
      glAccountId: GL_ACCOUNT_IDS.investment,
      amount: 7474,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'sell cost basis out',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PostSplitFee,
      entryId: GL_ENTRY_IDS.sellYuanta50PostSplit,
      glAccountId: GL_ACCOUNT_IDS.feeExpense,
      amount: 27,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'sell fee and tax',
    },
    {
      id: GL_LINE_IDS.sellYuanta50PostSplitLoss,
      entryId: GL_ENTRY_IDS.sellYuanta50PostSplit,
      glAccountId: GL_ACCOUNT_IDS.realizedLoss,
      amount: 5582,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'realized loss',
    },
    {
      id: GL_LINE_IDS.buyYuanta50PostSplitInvestment,
      entryId: GL_ENTRY_IDS.buyYuanta50PostSplit,
      glAccountId: GL_ACCOUNT_IDS.investment,
      amount: 998.2,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'buy cost(+fee)',
    },
    {
      id: GL_LINE_IDS.buyYuanta50PostSplitBrokerCash,
      entryId: GL_ENTRY_IDS.buyYuanta50PostSplit,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 998.2,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'cash out',
    },
    {
      id: GL_LINE_IDS.buyTsmcInvestment,
      entryId: GL_ENTRY_IDS.buyTsmc,
      glAccountId: GL_ACCOUNT_IDS.investment,
      amount: 20020,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'buy cost(+fee)',
    },
    {
      id: GL_LINE_IDS.buyTsmcBrokerCash,
      entryId: GL_ENTRY_IDS.buyTsmc,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 20020,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'cash out',
    },
    {
      id: GL_LINE_IDS.dividendTsmcBrokerCash,
      entryId: GL_ENTRY_IDS.dividendTsmc,
      glAccountId: GL_ACCOUNT_IDS.brokerCash,
      amount: 600,
      side: 'debit' as const,
      currency: 'TWD' as const,
      note: 'dividend in',
    },
    {
      id: GL_LINE_IDS.dividendTsmcIncome,
      entryId: GL_ENTRY_IDS.dividendTsmc,
      glAccountId: GL_ACCOUNT_IDS.dividendIncome,
      amount: 600,
      side: 'credit' as const,
      currency: 'TWD' as const,
      note: 'dividend income',
    },
  ]
}
