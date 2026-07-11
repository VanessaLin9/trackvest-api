/**
 * Taiwan stock asset catalog bootstrap (dry-run or write).
 *
 * Usage:
 *   pnpm assets:bootstrap:tw -- --dry-run
 *   pnpm assets:bootstrap:tw
 */

import { PrismaClient } from '@prisma/client'
import { runTwCatalogBootstrapPipeline } from '../src/assets/tw-catalog-bootstrap/tw-catalog-pipeline'
import { TwCatalogBootstrapError } from '../src/assets/tw-catalog-bootstrap/tw-catalog-bootstrap.error'

function parseArgs(argv: string[]): { dryRun: boolean } {
  const dryRun = argv.includes('--dry-run')
  return { dryRun }
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2))
  const prisma = new PrismaClient()
  let failed = false

  try {
    const summary = await runTwCatalogBootstrapPipeline({
      dryRun,
      db: prisma,
    })
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    failed = true
    if (error instanceof TwCatalogBootstrapError) {
      console.error(error.message)
    } else {
      console.error(error)
    }
  } finally {
    await prisma.$disconnect()
  }

  if (failed) {
    process.exit(1)
  }
}

main()
