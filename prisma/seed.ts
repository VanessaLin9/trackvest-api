// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

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

  // 建立兩個帳戶（銀行與券商）
  const [bank, broker] = await Promise.all([
    prisma.account.upsert({
      where: { id: 'bank-twd' },
      update: {},
      create: { id: 'bank-twd', userId: user.id, name: 'Bank TWD', type: 'bank', currency: 'TWD' },
    }),
    prisma.account.upsert({
      where: { id: 'broker-twd' },
      update: {},
      create: { id: 'broker-twd', userId: user.id, name: 'Broker TWD', type: 'broker', currency: 'TWD' },
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
