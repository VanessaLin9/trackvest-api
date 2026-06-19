import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import {
  BCRYPT_ROUNDS,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  resolveProductionDemoUserPassword,
} from './demo-identity'
import {
  getDemoAccountsData,
  getDemoGlAccountsData,
  getDemoGlEntriesData,
  getDemoGlLinesData,
  getDemoPositionLotsData,
  getDemoPositionsData,
  getDemoSellLotMatchesData,
  getDemoTransactionsData,
} from './demo-fixture-data'
import { assertDemoOwnershipGraphSafeForUpsert } from './assert-demo-ownership-safe'

/** Demo-user-owned graph only — upsert with fixed ids for idempotent prod-demo seed. */
export async function seedDemoUserGraphUpsert(prisma: PrismaClient) {
  await assertDemoOwnershipGraphSafeForUpsert(prisma)

  const demoPasswordHash = await bcrypt.hash(resolveProductionDemoUserPassword(), BCRYPT_ROUNDS)

  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      passwordHash: demoPasswordHash,
    },
    update: {
      email: DEMO_USER_EMAIL,
      passwordHash: demoPasswordHash,
    },
  })

  for (const account of getDemoAccountsData(DEMO_USER_ID)) {
    const { id, ...fields } = account
    await prisma.account.upsert({
      where: { id },
      create: account,
      update: fields,
    })
  }

  for (const glAccount of getDemoGlAccountsData(DEMO_USER_ID)) {
    const { id, ...fields } = glAccount
    await prisma.glAccount.upsert({
      where: { id },
      create: glAccount,
      update: fields,
    })
  }

  for (const transaction of getDemoTransactionsData()) {
    const { id, ...fields } = transaction
    await prisma.transaction.upsert({
      where: { id },
      create: transaction,
      update: fields,
    })
  }

  for (const position of getDemoPositionsData()) {
    const { id, ...fields } = position
    await prisma.position.upsert({
      where: { id },
      create: position,
      update: fields,
    })
  }

  for (const lot of getDemoPositionLotsData()) {
    const { id, ...fields } = lot
    await prisma.positionLot.upsert({
      where: { id },
      create: lot,
      update: fields,
    })
  }

  for (const match of getDemoSellLotMatchesData()) {
    const { id, ...fields } = match
    await prisma.sellLotMatch.upsert({
      where: { id },
      create: match,
      update: fields,
    })
  }

  for (const entry of getDemoGlEntriesData(DEMO_USER_ID)) {
    const { id, ...fields } = entry
    await prisma.glEntry.upsert({
      where: { id },
      create: entry,
      update: fields,
    })
  }

  for (const line of getDemoGlLinesData()) {
    const { id, ...fields } = line
    await prisma.glLine.upsert({
      where: { id },
      create: line,
      update: fields,
    })
  }
}
