import { PrismaClient } from '@prisma/client'
import { toNumber } from '../src/common/utils/number.util'

const DEMO_BROKER_ACCOUNT_ID = 'f0a6c5d2-4f9d-4d4d-b7fb-3c5ef0ddc201'
const YUANTA50_ASSET_ID = 'd60b9d4e-8a57-45da-b2cf-0eb0bb47f102'
const EXPECTED_OPEN_QUANTITY = 260
const EXPECTED_AVG_COST_MIN = 46
const EXPECTED_AVG_COST_MAX = 48

async function main() {
  const prisma = new PrismaClient()

  try {
    const position = await prisma.position.findFirst({
      where: {
        accountId: DEMO_BROKER_ACCOUNT_ID,
        assetId: YUANTA50_ASSET_ID,
        closedAt: null,
      },
      orderBy: { openedAt: 'desc' },
    })

    if (!position) {
      throw new Error(
        'Open 0050 position not found for demo broker account. Run split sync after seeding.',
      )
    }

    const quantity = toNumber(position.quantity)
    const avgCost = toNumber(position.avgCost)

    if (quantity !== EXPECTED_OPEN_QUANTITY) {
      throw new Error(
        `Expected ${EXPECTED_OPEN_QUANTITY} open 0050 shares after split replay, got ${quantity}.`,
      )
    }

    if (avgCost < EXPECTED_AVG_COST_MIN || avgCost > EXPECTED_AVG_COST_MAX) {
      throw new Error(
        `Expected split-adjusted avgCost near 47 TWD, got ${avgCost.toFixed(4)}.`,
      )
    }

    const splitEventCount = await prisma.corporateAction.count({
      where: { assetId: YUANTA50_ASSET_ID },
    })

    if (splitEventCount === 0) {
      throw new Error(
        'No CorporateAction rows for 0050. Run `pnpm corp-actions:sync-splits tw` first.',
      )
    }

    console.log(
      `0050 acceptance OK: ${quantity} shares, avgCost ${avgCost.toFixed(2)} TWD, ${splitEventCount} split event(s).`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
