import 'dotenv/config'
import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../src/prisma.service'
import { OwnershipService } from '../src/common/services/ownership.service'
import { GlService } from '../src/gl/services/gl.service'
import { PostingService } from '../src/gl/posting.service'
import { CorpActionService } from '../src/corporate-actions/corp-action.service'
import { PositionReplayService } from '../src/corporate-actions/position-replay.service'
import { FinmindTwSplitProvider } from '../src/corporate-actions/providers/finmind-tw-split.provider'
import { UsSplitInferProvider } from '../src/corporate-actions/providers/us-split-infer.provider'
import { PortfolioTrendService } from '../src/portfolio/portfolio-trend.service'
import { PortfolioHoldingsSnapshotService } from '../src/portfolio/portfolio-holdings-snapshot.service'
import { FxRateService } from '../src/fx/fx-rate.service'

// Uses the current 0050 transactions, not the fixed demo-seed quantities.
// Read-only by default; --apply backs up affected rows and runs the real sync twice.
async function main() {
  const prisma = new PrismaService()
  try {
    const asset = await prisma.asset.findFirstOrThrow({
      where: { symbol: '0050', baseCurrency: 'TWD', type: 'etf' },
    })
    const transactions = await prisma.transaction.findMany({
      where: { assetId: asset.id, type: { in: ['buy', 'sell'] }, isDeleted: false },
      orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
    })
    assert(transactions.length > 0, '0050 has no transactions')
    const txIds = transactions.map((tx) => tx.id)
    const snapshot = async () => ({
      actions: await prisma.corporateAction.findMany({
        where: { assetId: asset.id },
        include: { applications: true },
      }),
      positions: await prisma.position.findMany({
        where: { assetId: asset.id },
        orderBy: { accountId: 'asc' },
      }),
      lots: await prisma.positionLot.findMany({ where: { assetId: asset.id } }),
      matches: await prisma.sellLotMatch.findMany({ where: { sellTransactionId: { in: txIds } } }),
      entries: await prisma.glEntry.findMany({
        where: { refTxId: { in: txIds }, isDeleted: false },
        include: { lines: true },
      }),
    })
    if (process.argv.includes('--apply')) {
      const backupDir = await mkdtemp(join(tmpdir(), 'trackvest-0050-'))
      const backupPath = join(backupDir, 'before.json')
      await writeFile(backupPath, JSON.stringify({ transactions, ...(await snapshot()) }, null, 2))
      console.log(`Baseline saved: ${backupPath}`)
      const posting = new PostingService(
        prisma,
        new OwnershipService(prisma),
        new GlService(prisma),
      )
      const sync = new CorpActionService(
        prisma,
        new PositionReplayService(),
        posting,
        new FinmindTwSplitProvider(),
        new UsSplitInferProvider(),
      )
      for (let run = 1; run <= 2; run++) {
        console.log(
          JSON.stringify({
            run,
            ...(await sync.syncSplits({
              market: 'tw',
              assetIds: [asset.id],
              startDate: transactions[0].tradeTime.toISOString().slice(0, 10),
            })),
          }),
        )
        await verify()
      }
    } else {
      await verify()
    }

    async function verify() {
      const state = await snapshot()
      assert.equal(state.actions.length, 1, 'Expected exactly one 0050 split')
      const action = state.actions[0]
      assert.equal(action.exDate.toISOString().slice(0, 10), '2025-06-18')
      assert(action.ratio.equals(4))
      const expectedByAccount = new Map<string, Prisma.Decimal>()
      for (const tx of transactions) {
        assert(tx.quantity != null)
        const factor = tx.tradeTime < action.exDate ? action.ratio : new Prisma.Decimal(1)
        const signed = tx.quantity.mul(factor).mul(tx.type === 'buy' ? 1 : -1)
        expectedByAccount.set(
          tx.accountId,
          (expectedByAccount.get(tx.accountId) ?? new Prisma.Decimal(0)).add(signed),
        )
      }
      for (const [accountId, expected] of expectedByAccount) {
        const positions = state.positions.filter((p) => p.accountId === accountId && !p.closedAt)
        assert.equal(positions.length, expected.isZero() ? 0 : 1)
        const quantity = positions[0]?.quantity ?? new Prisma.Decimal(0)
        assert(quantity.equals(expected), `${accountId}: expected ${expected}, got ${quantity}`)
        const lots = state.lots.filter((lot) => lot.accountId === accountId)
        const lotQuantity = lots.reduce(
          (sum, lot) => sum.add(lot.remainingQuantity),
          new Prisma.Decimal(0),
        )
        assert(lotQuantity.equals(expected), 'Lot quantity must match position')
        const cost = lots.reduce(
          (sum, lot) => sum.add(lot.remainingQuantity.mul(lot.unitCost)),
          new Prisma.Decimal(0),
        )
        if (positions[0])
          assert(cost.sub(quantity.mul(positions[0].avgCost)).abs().lt('0.00000001'))
      }
      for (const tx of transactions.filter((tx) => tx.type === 'sell')) {
        const matches = state.matches.filter((match) => match.sellTransactionId === tx.id)
        const matched = matches.reduce(
          (sum, match) => sum.add(match.quantity),
          new Prisma.Decimal(0),
        )
        assert(matched.equals(tx.quantity!), 'Sell match quantities must equal sold quantity')
        const entries = state.entries.filter((entry) => entry.refTxId === tx.id)
        assert.equal(entries.length, 1, 'Exactly one active GL entry per sale')
        const fifoCost = matches.reduce(
          (sum, match) => sum.add(match.quantity.mul(match.unitCost)),
          new Prisma.Decimal(0),
        )
        const costLine = entries[0].lines.find((line) => line.note === 'sell cost basis out')
        assert(
          costLine &&
            costLine.side === 'credit' &&
            costLine.amount.sub(fifoCost).abs().lt('0.00000001'),
          'GL cost must match FIFO cost',
        )
        for (const entry of entries) {
          const balance = entry.lines.reduce(
            (sum, line) => sum.add(line.amount.mul(line.side === 'debit' ? 1 : -1)),
            new Prisma.Decimal(0),
          )
          assert(balance.abs().lt('0.00000001'), 'Sale GL must balance')
        }
      }
      const currentTransactions = await prisma.transaction.findMany({
        where: { id: { in: txIds } },
        orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
      })
      assert.deepEqual(
        currentTransactions,
        transactions,
        'Original transactions must remain unchanged',
      )
      const accounts = await prisma.account.findMany({
        where: { id: { in: [...expectedByAccount.keys()] } },
      })
      assert(
        accounts.every((account) => account.currency === 'TWD'),
        'This acceptance script expects TWD accounts',
      )
      const ownership = new OwnershipService(prisma)
      const fx = new FxRateService(prisma, {
        providerKey: 'disabled-for-acceptance',
        async getDailyReferenceRates() {
          throw new Error('Unexpected external FX lookup')
        },
      })
      const trend = new PortfolioTrendService(
        prisma,
        ownership,
        new PortfolioHoldingsSnapshotService(prisma, ownership, fx),
      )
      for (const userId of new Set(accounts.map((account) => account.userId))) {
        const accountIds = new Set(
          accounts.filter((account) => account.userId === userId).map((account) => account.id),
        )
        const expectedCost = state.lots
          .filter((lot) => accountIds.has(lot.accountId))
          .reduce(
            (sum, lot) => sum.add(lot.remainingQuantity.mul(lot.unitCost)),
            new Prisma.Decimal(0),
          )
        const result = await trend.getHoldingTrend(userId, asset.id)
        assert(
          result.points.some((point) => point.date === '2025-06-18'),
          'Trend must include split date',
        )
        assert(
          expectedCost.sub(result.points.at(-1)!.investedAmount).abs().lt('0.00000001'),
          'Latest historical cost must match current lots',
        )
      }
      console.log(
        JSON.stringify({
          verified: true,
          accounts: [...expectedByAccount].map(([accountId, quantity]) => ({
            accountId,
            quantity: quantity.toString(),
          })),
        }),
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
