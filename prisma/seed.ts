// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const SEEDED_BANK_ACCOUNT_ID = '497f9b9a-7788-4fb5-93a2-4c8d3f0d5e01'
const SEEDED_BROKER_ACCOUNT_ID = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'

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

  // 建立基本科目（GlAccount）
  await prisma.glAccount.createMany({
    data: [
      { userId: user.id, name: '資產-銀行(台幣)', type: 'asset', currency: 'TWD', linkedAccountId: bank.id },
      { userId: user.id, name: '資產-券商現金(台幣)', type: 'asset', currency: 'TWD', linkedAccountId: broker.id },
      { userId: user.id, name: '資產-投資-股票(台幣)', type: 'asset', currency: 'TWD' },
      { userId: user.id, name: '收入-股利', type: 'income', currency: 'TWD' },
      { userId: user.id, name: '費用-手續費', type: 'expense', currency: 'TWD' },
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
