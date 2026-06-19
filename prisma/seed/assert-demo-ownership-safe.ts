import { PrismaClient } from '@prisma/client'
import { SeedGuardError } from '../../src/deployment/seed-guards'
import {
  DEMO_ACCOUNT_IDS,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  GL_ACCOUNT_IDS,
} from './demo-identity'
import {
  GL_ENTRY_IDS,
  GL_LINE_IDS,
  LOT_IDS,
  POSITION_IDS,
  SELL_MATCH_IDS,
  TRANSACTION_IDS,
} from './demo-fixture-data'

function refuse(message: string): never {
  throw new SeedGuardError(message)
}

/** Refuse upsert when fixed demo ids are owned by a non-demo user or identity. */
export async function assertDemoOwnershipGraphSafeForUpsert(prisma: PrismaClient) {
  const userById = await prisma.user.findUnique({ where: { id: DEMO_USER_ID } })
  if (userById) {
    if (userById.email !== DEMO_USER_EMAIL) {
      refuse(
        `Production demo seed refused: user id ${DEMO_USER_ID} exists with email ${userById.email}, ` +
          `expected ${DEMO_USER_EMAIL}. Will not overwrite a real user.`,
      )
    }
    if (userById.role !== 'user') {
      refuse(
        `Production demo seed refused: demo user id ${DEMO_USER_ID} has role ${userById.role}; ` +
          'demo user must not be admin.',
      )
    }
  }

  const userByEmail = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } })
  if (userByEmail && userByEmail.id !== DEMO_USER_ID) {
    refuse(
      `Production demo seed refused: email ${DEMO_USER_EMAIL} belongs to user ${userByEmail.id}, ` +
        `not demo id ${DEMO_USER_ID}.`,
    )
  }

  for (const accountId of DEMO_ACCOUNT_IDS) {
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (account && account.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: account ${accountId} belongs to user ${account.userId}, ` +
          'not the demo user.',
      )
    }
  }

  for (const glAccountId of Object.values(GL_ACCOUNT_IDS)) {
    const glAccount = await prisma.glAccount.findUnique({ where: { id: glAccountId } })
    if (glAccount && glAccount.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: GL account ${glAccountId} belongs to user ${glAccount.userId}, ` +
          'not the demo user.',
      )
    }
  }

  for (const transactionId of Object.values(TRANSACTION_IDS)) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { account: true },
    })
    if (transaction && transaction.account.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: transaction ${transactionId} belongs to a non-demo account.`,
      )
    }
  }

  for (const positionId of Object.values(POSITION_IDS)) {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { account: true },
    })
    if (position && position.account.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: position ${positionId} belongs to a non-demo account.`,
      )
    }
  }

  for (const lotId of Object.values(LOT_IDS)) {
    const lot = await prisma.positionLot.findUnique({
      where: { id: lotId },
      include: { account: true },
    })
    if (lot && lot.account.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: position lot ${lotId} belongs to a non-demo account.`,
      )
    }
  }

  for (const matchId of Object.values(SELL_MATCH_IDS)) {
    const match = await prisma.sellLotMatch.findUnique({
      where: { id: matchId },
      include: {
        sellTransaction: { include: { account: true } },
      },
    })
    if (match && match.sellTransaction.account.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: sell lot match ${matchId} belongs to a non-demo account.`,
      )
    }
  }

  for (const entryId of Object.values(GL_ENTRY_IDS)) {
    const entry = await prisma.glEntry.findUnique({ where: { id: entryId } })
    if (entry && entry.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: GL entry ${entryId} belongs to user ${entry.userId}, ` +
          'not the demo user.',
      )
    }
  }

  for (const lineId of Object.values(GL_LINE_IDS)) {
    const line = await prisma.glLine.findUnique({
      where: { id: lineId },
      include: { entry: true },
    })
    if (line && line.entry.userId !== DEMO_USER_ID) {
      refuse(
        `Production demo seed refused: GL line ${lineId} belongs to a non-demo GL entry.`,
      )
    }
  }
}
