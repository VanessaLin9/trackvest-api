// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const SEEDED_BANK_ACCOUNT_ID = '497f9b9a-7788-4fb5-93a2-4c8d3f0d5e01'
const SEEDED_BROKER_ACCOUNT_ID = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'
const SEEDED_ASSETS = [
  { symbol: '2330', name: '台積電', type: 'equity', baseCurrency: 'TWD' },
  { symbol: '006208', name: '富邦台50', type: 'etf', baseCurrency: 'TWD' },
  { symbol: '2337', name: '旺宏', type: 'equity', baseCurrency: 'TWD' },
  { symbol: '3711', name: '日月光投控', type: 'equity', baseCurrency: 'TWD' },
  { symbol: '0050', name: '元大台灣50', type: 'etf', baseCurrency: 'TWD' },
] as const

async function migrateLegacySeedAccountId(legacyId: string, nextId: string) {
  const [legacyAccount, normalizedAccount] = await Promise.all([
    prisma.account.findUnique({ where: { id: legacyId }, select: { id: true } }),
    prisma.account.findUnique({ where: { id: nextId }, select: { id: true } }),
  ])

  if (!legacyAccount || normalizedAccount) {
    return
  }

  await prisma.$executeRaw`
    UPDATE "Account"
    SET "id" = ${nextId}
    WHERE "id" = ${legacyId}
  `
}

async function main() {
  // 建立測試用 user
  const user = await prisma.user.upsert({
    where: { email: 'demo@trackvest.local' },
    update: {},
    create: {
      email: 'demo@trackvest.local',
      passwordHash: '!', // 只是測試用
    },
  })

  await migrateLegacySeedAccountId('bank-twd', SEEDED_BANK_ACCOUNT_ID)
  await migrateLegacySeedAccountId('broker-twd', SEEDED_BROKER_ACCOUNT_ID)

  // 建立兩個帳戶（銀行與券商）
  const [bank, broker] = await Promise.all([
    prisma.account.upsert({
      where: { id: SEEDED_BANK_ACCOUNT_ID },
      update: {
        userId: user.id,
        name: 'Bank TWD',
        type: 'bank',
        currency: 'TWD',
        broker: null,
      },
      create: {
        id: SEEDED_BANK_ACCOUNT_ID,
        userId: user.id,
        name: 'Bank TWD',
        type: 'bank',
        currency: 'TWD',
        broker: null,
      },
    }),
    prisma.account.upsert({
      where: { id: SEEDED_BROKER_ACCOUNT_ID },
      update: {
        userId: user.id,
        name: 'Broker TWD',
        type: 'broker',
        currency: 'TWD',
        broker: 'cathay',
      },
      create: {
        id: SEEDED_BROKER_ACCOUNT_ID,
        userId: user.id,
        name: 'Broker TWD',
        type: 'broker',
        currency: 'TWD',
        broker: 'cathay',
      },
    }),
  ])

  const seededAssets = await Promise.all(
    SEEDED_ASSETS.map((asset) =>
      prisma.asset.upsert({
        where: { symbol: asset.symbol },
        update: {
          name: asset.name,
          type: asset.type,
          baseCurrency: asset.baseCurrency,
        },
        create: asset,
      }),
    ),
  )

  const seededAssetMap = new Map(
    seededAssets.map((asset) => [asset.symbol, asset.id]),
  )

  await Promise.all(
    SEEDED_ASSETS.map((asset) =>
      prisma.assetAlias.upsert({
        where: {
          alias_broker: {
            alias: asset.name,
            broker: '',
          },
        },
        update: { assetId: seededAssetMap.get(asset.symbol)! },
        create: {
          assetId: seededAssetMap.get(asset.symbol)!,
          alias: asset.name,
          broker: '',
        },
      }),
    ),
  )

  await prisma.assetAlias.upsert({
    where: {
      alias_broker: {
        alias: '國泰台灣領袖50',
        broker: 'cathay',
      },
    },
    update: { assetId: seededAssetMap.get('0050')! },
    create: {
      assetId: seededAssetMap.get('0050')!,
      alias: '國泰台灣領袖50',
      broker: 'cathay',
    },
  })

  // 建立基本科目（GlAccount）
  await prisma.glAccount.createMany({
    data: [
      { userId: user.id, name: '資產-銀行(台幣)', type: 'asset', currency: 'TWD', linkedAccountId: bank.id },
      { userId: user.id, name: '資產-券商現金(台幣)', type: 'asset', currency: 'TWD', linkedAccountId: broker.id },
      { userId: user.id, name: '資產-投資-股票(台幣)', type: 'asset', currency: 'TWD' },
      { userId: user.id, name: '權益-投入資本', type: 'equity', currency: 'TWD' },
      { userId: user.id, name: '收入-股利', type: 'income', currency: 'TWD' },
      { userId: user.id, name: '收入-已實現損益-收益', type: 'income', currency: 'TWD' },
      { userId: user.id, name: '費用-手續費', type: 'expense', currency: 'TWD' },
      { userId: user.id, name: '費用-已實現損益-損失', type: 'expense', currency: 'TWD' },
      { userId: user.id, name: '費用-餐飲', type: 'expense', currency: 'TWD' },
      { userId: user.id, name: '費用-交通', type: 'expense', currency: 'TWD' },
    ],
    skipDuplicates: true,
  })

  console.log('🌱 Seed completed successfully.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
