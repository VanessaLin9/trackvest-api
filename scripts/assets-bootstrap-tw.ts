/**
 * Taiwan stock asset catalog bootstrap (dry-run or write).
 *
 * Usage:
 *   pnpm assets:bootstrap:tw -- --dry-run
 */

import { runTwCatalogDryRunPipeline } from '../src/assets/tw-catalog-bootstrap/tw-catalog-pipeline'
import { TwCatalogBootstrapError } from '../src/assets/tw-catalog-bootstrap/tw-catalog-bootstrap.error'

function parseArgs(argv: string[]): { dryRun: boolean } {
  const dryRun = argv.includes('--dry-run')
  return { dryRun }
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2))

  if (!dryRun) {
    console.error(
      'Only --dry-run is supported in Task 1. Database writes will be added in Task 2.',
    )
    process.exit(1)
  }

  const summary = await runTwCatalogDryRunPipeline({ dryRun: true })
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  if (error instanceof TwCatalogBootstrapError) {
    console.error(error.message)
    process.exit(1)
    return
  }

  console.error(error)
  process.exit(1)
})
