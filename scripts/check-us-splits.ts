import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../src/prisma.service';
import { OwnershipService } from '../src/common/services/ownership.service';
import { GlService } from '../src/gl/services/gl.service';
import { PostingService } from '../src/gl/posting.service';
import { CorpActionService } from '../src/corporate-actions/corp-action.service';
import { PositionReplayService } from '../src/corporate-actions/position-replay.service';
import { FinmindTwSplitProvider } from '../src/corporate-actions/providers/finmind-tw-split.provider';
import { AlphaVantageUsSplitProvider } from '../src/corporate-actions/providers/alpha-vantage-us-split.provider';
import { FinmindUsPriceProvider } from '../src/market-price/providers/finmind-us-price.provider';

async function main() {
  const provider = new AlphaVantageUsSplitProvider();
  const events = await provider.fetchSplitEvents({
    stockId: 'AAPL',
    startDate: '2020-08-01',
    endDate: '2020-09-01',
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].exDate, '2020-08-31');
  assert.equal(events[0].ratio, 4);
  console.log(
    'AAPL explicit split event verified; checking historical quotes next',
  );
  const prices = await new FinmindUsPriceProvider(provider).getDailyPrices({
    stockId: 'AAPL',
    startDate: '2020-08-28',
    endDate: '2020-08-31',
  });
  const before = prices.find((p) => p.date === '2020-08-28')!;
  const after = prices.find((p) => p.date === '2020-08-31')!;
  assert(before && after, 'Missing AAPL price history');
  assert(
    before.close > 490 && before.close < 510,
    'Pre-split AAPL quote must be in original share units',
  );
  assert(after.close > 120 && after.close < 140);
  console.log(
    JSON.stringify({
      liveProviderVerified: true,
      event: events[0],
      beforeClose: before.close,
      afterClose: after.close,
    }),
  );
  if (!process.argv.includes('--apply')) return;

  const prisma = new PrismaService();
  try {
    const assets = await prisma.asset.findMany({
      where: {
        baseCurrency: 'USD',
        type: { in: ['equity', 'etf'] },
        txs: { some: { isDeleted: false, type: { in: ['buy', 'sell'] } } },
      },
    });
    const assetIds = assets.map((a) => a.id);
    const transactions = await prisma.transaction.findMany({
      where: { assetId: { in: assetIds } },
      orderBy: { id: 'asc' },
    });
    const txIds = transactions.map((tx) => tx.id);
    const backupDir = await mkdtemp(join(tmpdir(), 'trackvest-us-splits-'));
    const backupPath = join(backupDir, 'before.json');
    await writeFile(
      backupPath,
      JSON.stringify(
        {
          transactions,
          positions: await prisma.position.findMany({
            where: { assetId: { in: assetIds } },
          }),
          lots: await prisma.positionLot.findMany({
            where: { assetId: { in: assetIds } },
          }),
          matches: await prisma.sellLotMatch.findMany({
            where: { sellTransactionId: { in: txIds } },
          }),
          entries: await prisma.glEntry.findMany({
            where: { refTxId: { in: txIds } },
            include: { lines: true },
          }),
          actions: await prisma.corporateAction.findMany({
            where: { assetId: { in: assetIds } },
            include: { applications: true },
          }),
        },
        null,
        2,
      ),
    );
    console.log(`Baseline saved: ${backupPath}`);
    const posting = new PostingService(
      prisma,
      new OwnershipService(prisma),
      new GlService(prisma),
    );
    const sync = new CorpActionService(
      prisma,
      new PositionReplayService(),
      posting,
      new FinmindTwSplitProvider(),
      provider,
    );
    if (assetIds.length)
      console.log(
        await sync.syncSplits({
          market: 'us',
          assetIds,
          startDate: '1970-01-01',
        }),
      );
    assert.deepEqual(
      await prisma.transaction.findMany({
        where: { assetId: { in: assetIds } },
        orderBy: { id: 'asc' },
      }),
      transactions,
    );
    console.log(
      JSON.stringify({
        originalTransactionsUnchanged: true,
        assets: assets.map((a) => a.symbol),
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'US split verification failed',
  );
  process.exitCode = 1;
});
