import { PrismaClient } from '@prisma/client'
import {
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
import { resolveDemoUserPasswordHash } from './demo-user-password'
import type { SeedDbClient } from './seed-db-client'

async function upsertDemoUserGraphWrites(db: SeedDbClient, passwordHash: string) {
  await db.user.upsert({
    where: { id: DEMO_USER_ID },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      passwordHash,
    },
    update: {
      email: DEMO_USER_EMAIL,
      passwordHash,
    },
  })

  for (const account of getDemoAccountsData(DEMO_USER_ID)) {
    const { id, ...fields } = account
    await db.account.upsert({
      where: { id },
      create: account,
      update: fields,
    })
  }

  for (const glAccount of getDemoGlAccountsData(DEMO_USER_ID)) {
    const { id, ...fields } = glAccount
    await db.glAccount.upsert({
      where: { id },
      create: glAccount,
      update: fields,
    })
  }

  for (const transaction of getDemoTransactionsData()) {
    const { id, ...fields } = transaction
    await db.transaction.upsert({
      where: { id },
      create: transaction,
      update: fields,
    })
  }

  for (const position of getDemoPositionsData()) {
    const { id, ...fields } = position
    await db.position.upsert({
      where: { id },
      create: position,
      update: fields,
    })
  }

  for (const lot of getDemoPositionLotsData()) {
    const { id, ...fields } = lot
    await db.positionLot.upsert({
      where: { id },
      create: lot,
      update: fields,
    })
  }

  for (const match of getDemoSellLotMatchesData()) {
    const { id, ...fields } = match
    await db.sellLotMatch.upsert({
      where: { id },
      create: match,
      update: fields,
    })
  }

  for (const entry of getDemoGlEntriesData(DEMO_USER_ID)) {
    const { id, ...fields } = entry
    await db.glEntry.upsert({
      where: { id },
      create: entry,
      update: fields,
    })
  }

  for (const line of getDemoGlLinesData()) {
    const { id, ...fields } = line
    await db.glLine.upsert({
      where: { id },
      create: line,
      update: fields,
    })
  }
}

/** Demo-user-owned graph only — preflight + upserts in one interactive transaction. */
export async function seedDemoUserGraphUpsert(prisma: PrismaClient) {
  const password = resolveProductionDemoUserPassword()

  await prisma.$transaction(async (tx) => {
    await assertDemoOwnershipGraphSafeForUpsert(tx)
    const passwordHash = await resolveDemoUserPasswordHash(tx, password)
    await upsertDemoUserGraphWrites(tx, passwordHash)
  })
}
