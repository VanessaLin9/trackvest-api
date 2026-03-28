import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_USER_ID = '5f9b7d4a-69d4-4a78-98f4-bc82eeac1001'
const DEMO_USER_EMAIL = 'demo@trackvest.local'

const BANK_ACCOUNT_ID = '497f9b9a-7788-4fb5-93a2-4c8d3f0d5e01'
const BROKER_ACCOUNT_ID = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'

const ASSET_IDS = {
  tsmc: '0dc4b8a9-5f72-4bbf-a02d-1c1dd7a9f101',
  yuanta50: 'd60b9d4e-8a57-45da-b2cf-0eb0bb47f102',
  fubon50: 'adfc4a1c-6886-4c17-a4cf-f6d67346f103',
  aseh: '0f1b0eb7-4e4a-4279-8c5b-4f7f4c5bf104',
  mxic: 'd7c74ef1-2fb4-4bcb-82d5-7ac0ab1e7105',
} as const

const GL_ACCOUNT_IDS = {
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

const TRANSACTION_IDS = {
  depositBroker: '675676e8-3f24-4cbc-b210-b5efea213001',
  buyYuanta50Lot1: '4df6b893-c1c0-4d99-aaf3-ebf79b863002',
  buyYuanta50Lot2: '6de8e1ec-9f1a-4e88-983f-c4d400953003',
  sellYuanta50: 'e6f7ecf7-bf11-4f48-b80f-af6c7d1f3004',
  buyTsmc: '97efded6-3c65-4247-a8c9-31d4aaed3005',
  dividendTsmc: 'c8d77c1e-e276-4ae9-8ed6-c2f359f43006',
} as const

const POSITION_IDS = {
  yuanta50: '1791f0ad-7fc5-4d38-b6b0-30225d3c4001',
  tsmc: '5b153bb1-2fed-4a52-9435-df5b389c4002',
} as const

const LOT_IDS = {
  yuanta50Lot1: '62955b50-bcb6-4707-bb83-12e195a55001',
  yuanta50Lot2: 'a758bf8b-f4d1-4d6f-a29c-2a7f17765002',
  tsmcLot1: 'f8f2cf31-a8bc-4ef7-8d5d-85b6dc6d5003',
} as const

const SELL_MATCH_IDS = {
  yuanta50Lot1: '5b100242-ec32-4b11-bff5-09a9a34f6001',
  yuanta50Lot2: 'b1410ef7-5486-4614-b89f-9e86b2526002',
} as const

const GL_ENTRY_IDS = {
  depositBroker: 'aa8ab17f-f599-4f3f-bb7d-9fd8c85f7001',
  buyYuanta50Lot1: 'ea0d111c-8061-414b-a30a-af7b9d857002',
  buyYuanta50Lot2: '2a7f25be-e16b-4468-83f9-51bd73a67003',
  sellYuanta50: '3668d8c6-63b5-4d95-a4d2-e26a23857004',
  buyTsmc: 'b74a55e1-80f0-41a3-9c09-a7428a027005',
  dividendTsmc: '31c1480d-7d43-4cc1-a31a-f58171be7006',
} as const

async function wipeAllData() {
  await prisma.glLine.deleteMany()
  await prisma.glEntry.deleteMany()
  await prisma.sellLotMatch.deleteMany()
  await prisma.positionLot.deleteMany()
  await prisma.position.deleteMany()
  await prisma.txTag.deleteMany()
  await prisma.tag.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.price.deleteMany()
  await prisma.fxRate.deleteMany()
  await prisma.assetAlias.deleteMany()
  await prisma.glAccount.deleteMany()
  await prisma.account.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.user.deleteMany()
}

async function main() {
  await wipeAllData()

  const demoUser = await prisma.user.create({
    data: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      passwordHash: '!',
    },
  })

  await prisma.account.createMany({
    data: [
      {
        id: BANK_ACCOUNT_ID,
        userId: demoUser.id,
        name: 'Bank TWD',
        type: 'bank',
        currency: 'TWD',
      },
      {
        id: BROKER_ACCOUNT_ID,
        userId: demoUser.id,
        name: 'Broker TWD',
        type: 'broker',
        currency: 'TWD',
        broker: 'cathay',
      },
    ],
  })

  await prisma.asset.createMany({
    data: [
      { id: ASSET_IDS.tsmc, symbol: '2330', name: '台積電', type: 'equity', baseCurrency: 'TWD' },
      { id: ASSET_IDS.yuanta50, symbol: '0050', name: '元大台灣50', type: 'etf', baseCurrency: 'TWD' },
      { id: ASSET_IDS.fubon50, symbol: '006208', name: '富邦台50', type: 'etf', baseCurrency: 'TWD' },
      { id: ASSET_IDS.aseh, symbol: '3711', name: '日月光投控', type: 'equity', baseCurrency: 'TWD' },
      { id: ASSET_IDS.mxic, symbol: '2337', name: '旺宏', type: 'equity', baseCurrency: 'TWD' },
    ],
  })

  await prisma.assetAlias.createMany({
    data: [
      { assetId: ASSET_IDS.tsmc, alias: '台積電', broker: '' },
      { assetId: ASSET_IDS.yuanta50, alias: '元大台灣50', broker: '' },
      { assetId: ASSET_IDS.yuanta50, alias: '台灣50', broker: '' },
      { assetId: ASSET_IDS.fubon50, alias: '富邦台50', broker: '' },
      { assetId: ASSET_IDS.aseh, alias: '日月光投控', broker: '' },
      { assetId: ASSET_IDS.mxic, alias: '旺宏', broker: '' },
      { assetId: ASSET_IDS.yuanta50, alias: '國泰台灣領袖50', broker: 'cathay' },
    ],
  })

  await prisma.glAccount.createMany({
    data: [
      {
        id: GL_ACCOUNT_IDS.bankCash,
        userId: demoUser.id,
        name: '資產-銀行(台幣)',
        type: 'asset',
        currency: 'TWD',
        linkedAccountId: BANK_ACCOUNT_ID,
      },
      {
        id: GL_ACCOUNT_IDS.brokerCash,
        userId: demoUser.id,
        name: '資產-券商現金(台幣)',
        type: 'asset',
        currency: 'TWD',
        linkedAccountId: BROKER_ACCOUNT_ID,
      },
      {
        id: GL_ACCOUNT_IDS.investment,
        userId: demoUser.id,
        name: '資產-投資-股票(台幣)',
        type: 'asset',
        currency: 'TWD',
      },
      {
        id: GL_ACCOUNT_IDS.equity,
        userId: demoUser.id,
        name: '權益-投入資本',
        type: 'equity',
        currency: 'TWD',
      },
      {
        id: GL_ACCOUNT_IDS.dividendIncome,
        userId: demoUser.id,
        name: '收入-股利',
        type: 'income',
        currency: 'TWD',
      },
      {
        id: GL_ACCOUNT_IDS.realizedGain,
        userId: demoUser.id,
        name: '收入-已實現損益-收益',
        type: 'income',
        currency: 'TWD',
      },
      {
        id: GL_ACCOUNT_IDS.feeExpense,
        userId: demoUser.id,
        name: '費用-手續費',
        type: 'expense',
        currency: 'TWD',
      },
      {
        id: GL_ACCOUNT_IDS.realizedLoss,
        userId: demoUser.id,
        name: '費用-已實現損益-損失',
        type: 'expense',
        currency: 'TWD',
      },
      {
        id: GL_ACCOUNT_IDS.diningExpense,
        userId: demoUser.id,
        name: '費用-餐飲',
        type: 'expense',
        currency: 'TWD',
      },
      {
        id: GL_ACCOUNT_IDS.travelExpense,
        userId: demoUser.id,
        name: '費用-交通',
        type: 'expense',
        currency: 'TWD',
      },
    ],
  })

  await prisma.transaction.createMany({
    data: [
      {
        id: TRANSACTION_IDS.depositBroker,
        accountId: BROKER_ACCOUNT_ID,
        type: 'deposit',
        amount: 200000,
        fee: 0,
        tax: 0,
        tradeTime: new Date('2026-03-01T09:00:00.000Z'),
        note: '初始入金',
      },
      {
        id: TRANSACTION_IDS.buyYuanta50Lot1,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.yuanta50,
        type: 'buy',
        amount: 18020,
        quantity: 100,
        price: 180,
        fee: 20,
        tax: 0,
        brokerOrderNo: 'D202603020001',
        tradeTime: new Date('2026-03-02T09:00:00.000Z'),
        note: '0050 首批建倉',
      },
      {
        id: TRANSACTION_IDS.buyYuanta50Lot2,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.yuanta50,
        type: 'buy',
        amount: 9510,
        quantity: 50,
        price: 190,
        fee: 10,
        tax: 0,
        brokerOrderNo: 'D202603080001',
        tradeTime: new Date('2026-03-08T09:00:00.000Z'),
        note: '0050 逢低加碼',
      },
      {
        id: TRANSACTION_IDS.sellYuanta50,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.yuanta50,
        type: 'sell',
        amount: 23946,
        quantity: 120,
        price: 200,
        fee: 30,
        tax: 24,
        brokerOrderNo: 'D202603180001',
        tradeTime: new Date('2026-03-18T09:00:00.000Z'),
        note: '0050 部分獲利了結',
      },
      {
        id: TRANSACTION_IDS.buyTsmc,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.tsmc,
        type: 'buy',
        amount: 18020,
        quantity: 20,
        price: 900,
        fee: 20,
        tax: 0,
        brokerOrderNo: 'D202603200001',
        tradeTime: new Date('2026-03-20T09:00:00.000Z'),
        note: '台積電長期配置',
      },
      {
        id: TRANSACTION_IDS.dividendTsmc,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.tsmc,
        type: 'dividend',
        amount: 600,
        fee: 0,
        tax: 0,
        tradeTime: new Date('2026-03-25T09:00:00.000Z'),
        note: '台積電股利入帳',
      },
    ],
  })

  await prisma.position.createMany({
    data: [
      {
        id: POSITION_IDS.yuanta50,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.yuanta50,
        quantity: 30,
        avgCost: 190.2,
        openedAt: new Date('2026-03-02T09:00:00.000Z'),
      },
      {
        id: POSITION_IDS.tsmc,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.tsmc,
        quantity: 20,
        avgCost: 901,
        openedAt: new Date('2026-03-20T09:00:00.000Z'),
      },
    ],
  })

  await prisma.positionLot.createMany({
    data: [
      {
        id: LOT_IDS.yuanta50Lot1,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.yuanta50,
        sourceTransactionId: TRANSACTION_IDS.buyYuanta50Lot1,
        originalQuantity: 100,
        remainingQuantity: 0,
        unitCost: 180.2,
        openedAt: new Date('2026-03-02T09:00:00.000Z'),
        closedAt: new Date('2026-03-18T09:00:00.000Z'),
      },
      {
        id: LOT_IDS.yuanta50Lot2,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.yuanta50,
        sourceTransactionId: TRANSACTION_IDS.buyYuanta50Lot2,
        originalQuantity: 50,
        remainingQuantity: 30,
        unitCost: 190.2,
        openedAt: new Date('2026-03-08T09:00:00.000Z'),
      },
      {
        id: LOT_IDS.tsmcLot1,
        accountId: BROKER_ACCOUNT_ID,
        assetId: ASSET_IDS.tsmc,
        sourceTransactionId: TRANSACTION_IDS.buyTsmc,
        originalQuantity: 20,
        remainingQuantity: 20,
        unitCost: 901,
        openedAt: new Date('2026-03-20T09:00:00.000Z'),
      },
    ],
  })

  await prisma.sellLotMatch.createMany({
    data: [
      {
        id: SELL_MATCH_IDS.yuanta50Lot1,
        sellTransactionId: TRANSACTION_IDS.sellYuanta50,
        buyLotId: LOT_IDS.yuanta50Lot1,
        quantity: 100,
        unitCost: 180.2,
      },
      {
        id: SELL_MATCH_IDS.yuanta50Lot2,
        sellTransactionId: TRANSACTION_IDS.sellYuanta50,
        buyLotId: LOT_IDS.yuanta50Lot2,
        quantity: 20,
        unitCost: 190.2,
      },
    ],
  })

  await prisma.price.createMany({
    data: [
      {
        assetId: ASSET_IDS.yuanta50,
        price: 205,
        asOf: new Date('2026-03-27T09:00:00.000Z'),
        source: 'seed',
      },
      {
        assetId: ASSET_IDS.tsmc,
        price: 950,
        asOf: new Date('2026-03-27T09:00:00.000Z'),
        source: 'seed',
      },
      {
        assetId: ASSET_IDS.fubon50,
        price: 112,
        asOf: new Date('2026-03-27T09:00:00.000Z'),
        source: 'seed',
      },
    ],
  })

  await prisma.glEntry.createMany({
    data: [
      {
        id: GL_ENTRY_IDS.depositBroker,
        userId: demoUser.id,
        date: new Date('2026-03-01T09:00:00.000Z'),
        memo: '初始入金',
        source: 'auto:transaction:deposit',
        refTxId: TRANSACTION_IDS.depositBroker,
      },
      {
        id: GL_ENTRY_IDS.buyYuanta50Lot1,
        userId: demoUser.id,
        date: new Date('2026-03-02T09:00:00.000Z'),
        memo: '0050 首批建倉',
        source: 'auto:transaction:buy',
        refTxId: TRANSACTION_IDS.buyYuanta50Lot1,
      },
      {
        id: GL_ENTRY_IDS.buyYuanta50Lot2,
        userId: demoUser.id,
        date: new Date('2026-03-08T09:00:00.000Z'),
        memo: '0050 逢低加碼',
        source: 'auto:transaction:buy',
        refTxId: TRANSACTION_IDS.buyYuanta50Lot2,
      },
      {
        id: GL_ENTRY_IDS.sellYuanta50,
        userId: demoUser.id,
        date: new Date('2026-03-18T09:00:00.000Z'),
        memo: '0050 部分獲利了結',
        source: 'auto:transaction:sell',
        refTxId: TRANSACTION_IDS.sellYuanta50,
      },
      {
        id: GL_ENTRY_IDS.buyTsmc,
        userId: demoUser.id,
        date: new Date('2026-03-20T09:00:00.000Z'),
        memo: '台積電長期配置',
        source: 'auto:transaction:buy',
        refTxId: TRANSACTION_IDS.buyTsmc,
      },
      {
        id: GL_ENTRY_IDS.dividendTsmc,
        userId: demoUser.id,
        date: new Date('2026-03-25T09:00:00.000Z'),
        memo: '台積電股利入帳',
        source: 'auto:transaction:dividend',
        refTxId: TRANSACTION_IDS.dividendTsmc,
      },
    ],
  })

  await prisma.glLine.createMany({
    data: [
      {
        entryId: GL_ENTRY_IDS.depositBroker,
        glAccountId: GL_ACCOUNT_IDS.brokerCash,
        amount: 200000,
        side: 'debit',
        currency: 'TWD',
        note: 'deposit in',
      },
      {
        entryId: GL_ENTRY_IDS.depositBroker,
        glAccountId: GL_ACCOUNT_IDS.equity,
        amount: 200000,
        side: 'credit',
        currency: 'TWD',
        note: 'owner contribution',
      },
      {
        entryId: GL_ENTRY_IDS.buyYuanta50Lot1,
        glAccountId: GL_ACCOUNT_IDS.investment,
        amount: 18020,
        side: 'debit',
        currency: 'TWD',
        note: 'buy cost(+fee)',
      },
      {
        entryId: GL_ENTRY_IDS.buyYuanta50Lot1,
        glAccountId: GL_ACCOUNT_IDS.brokerCash,
        amount: 18020,
        side: 'credit',
        currency: 'TWD',
        note: 'cash out',
      },
      {
        entryId: GL_ENTRY_IDS.buyYuanta50Lot2,
        glAccountId: GL_ACCOUNT_IDS.investment,
        amount: 9510,
        side: 'debit',
        currency: 'TWD',
        note: 'buy cost(+fee)',
      },
      {
        entryId: GL_ENTRY_IDS.buyYuanta50Lot2,
        glAccountId: GL_ACCOUNT_IDS.brokerCash,
        amount: 9510,
        side: 'credit',
        currency: 'TWD',
        note: 'cash out',
      },
      {
        entryId: GL_ENTRY_IDS.sellYuanta50,
        glAccountId: GL_ACCOUNT_IDS.brokerCash,
        amount: 23946,
        side: 'debit',
        currency: 'TWD',
        note: 'sell proceeds in',
      },
      {
        entryId: GL_ENTRY_IDS.sellYuanta50,
        glAccountId: GL_ACCOUNT_IDS.investment,
        amount: 21824,
        side: 'credit',
        currency: 'TWD',
        note: 'sell cost basis out',
      },
      {
        entryId: GL_ENTRY_IDS.sellYuanta50,
        glAccountId: GL_ACCOUNT_IDS.feeExpense,
        amount: 54,
        side: 'debit',
        currency: 'TWD',
        note: 'sell fee and tax',
      },
      {
        entryId: GL_ENTRY_IDS.sellYuanta50,
        glAccountId: GL_ACCOUNT_IDS.realizedGain,
        amount: 2176,
        side: 'credit',
        currency: 'TWD',
        note: 'realized gain',
      },
      {
        entryId: GL_ENTRY_IDS.buyTsmc,
        glAccountId: GL_ACCOUNT_IDS.investment,
        amount: 18020,
        side: 'debit',
        currency: 'TWD',
        note: 'buy cost(+fee)',
      },
      {
        entryId: GL_ENTRY_IDS.buyTsmc,
        glAccountId: GL_ACCOUNT_IDS.brokerCash,
        amount: 18020,
        side: 'credit',
        currency: 'TWD',
        note: 'cash out',
      },
      {
        entryId: GL_ENTRY_IDS.dividendTsmc,
        glAccountId: GL_ACCOUNT_IDS.brokerCash,
        amount: 600,
        side: 'debit',
        currency: 'TWD',
        note: 'dividend in',
      },
      {
        entryId: GL_ENTRY_IDS.dividendTsmc,
        glAccountId: GL_ACCOUNT_IDS.dividendIncome,
        amount: 600,
        side: 'credit',
        currency: 'TWD',
        note: 'dividend income',
      },
    ],
  })

  console.log('Seed completed successfully for demo user:', DEMO_USER_EMAIL)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
