import { ValidationPipe, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Currency,
  GlAccountPurpose,
  GlAccountType,
  Prisma,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { PostingService } from '../src/gl/posting.service';
import { US_SPLIT_EVENT_PROVIDER } from '../src/corporate-actions/corp-action.types';
import { authCookieFor } from './helpers/auth';
import {
  clearDatabase,
  createTestDatabaseConfig,
  dropTestSchema,
  prepareTestDatabase,
} from './helpers/e2e-db';

describe('US splits and broker cash-in-lieu (e2e)', () => {
  const database = createTestDatabaseConfig();
  const previousJobs = process.env.ENABLE_SCHEDULED_JOBS;
  let app: INestApplication;
  let prisma: PrismaService;
  const provider = {
    market: 'us',
    providerKey: 'alpha-vantage',
    fetchSplitEvents: jest.fn(),
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = database.testUrl;
    process.env.ENABLE_SCHEDULED_JOBS = 'false';
    prepareTestDatabase(database.testUrl);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(US_SPLIT_EVENT_PROVIDER)
      .useValue(provider)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(async () => {
    await clearDatabase(prisma);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (app) await app.close();
    await dropTestSchema(database.adminUrl, database.schema);
    process.env.DATABASE_URL = database.baseUrl;
    if (previousJobs === undefined) delete process.env.ENABLE_SCHEDULED_JOBS;
    else process.env.ENABLE_SCHEDULED_JOBS = previousJobs;
  });

  async function fixture(quantities = [5, 10]) {
    const user = await prisma.user.create({
      data: { email: 'splits@test.local', passwordHash: '!' },
    });
    const account = await prisma.account.create({
      data: { userId: user.id, type: 'broker', name: 'USD', currency: 'USD' },
    });
    const asset = await prisma.asset.create({
      data: {
        symbol: 'TEST',
        name: 'Test ETF',
        type: 'etf',
        assetClass: 'equity',
        baseCurrency: 'USD',
      },
    });
    for (const [purpose, type] of [
      ['investment_bucket', 'asset'],
      ['fee_expense', 'expense'],
      ['realized_gain_income', 'income'],
      ['realized_loss_expense', 'expense'],
    ] as [GlAccountPurpose, GlAccountType][]) {
      await prisma.glAccount.create({
        data: {
          userId: user.id,
          name: purpose,
          purpose,
          type,
          currency: Currency.USD,
        },
      });
    }
    const cookie = authCookieFor(app, { id: user.id });
    for (const [index, quantity] of quantities.entries()) {
      await request(app.getHttpServer())
        .post('/transactions')
        .set('Cookie', cookie)
        .send({
          accountId: account.id,
          assetId: asset.id,
          type: 'buy',
          quantity,
          amount: quantity * (index + 1) * 10,
          price: (index + 1) * 10,
          tradeTime: `2025-06-0${index + 1}T12:00:00Z`,
        })
        .expect(201);
    }
    provider.fetchSplitEvents.mockResolvedValue([
      {
        stockId: 'TEST',
        exDate: '2025-06-18',
        direction: 'reverse_split',
        ratio: 0.1,
        sourceKey: 'TEST:2025-06-18',
      },
    ]);
    const sync = () =>
      request(app.getHttpServer())
        .post('/corp-actions/sync/splits')
        .set('Cookie', authCookieFor(app, { id: user.id, role: 'admin' }))
        .send({
          market: 'us',
          assetIds: [asset.id],
          startDate: '2025-01-01',
          endDate: '2025-12-31',
        })
        .expect(201);
    await sync();
    const action = await prisma.corporateAction.findFirstOrThrow({
      where: { assetId: asset.id },
    });
    const body = {
      accountId: account.id,
      amount: '60.00',
      quantity: '0.5',
      currency: 'USD',
      paidAt: '2025-06-20T12:00:00Z',
      reference: 'statement-123',
    };
    const pay = (overrides = {}) =>
      request(app.getHttpServer())
        .post(`/corp-actions/${action.id}/cash-in-lieu`)
        .set('Cookie', cookie)
        .send({ ...body, ...overrides });
    return { user, account, asset, action, cookie, body, pay, sync };
  }

  it('syncs exact fractions, records cash/cost/gain atomically and stays idempotent on replay', async () => {
    const { pay, sync, asset, account } = await fixture();
    expect(
      (
        await prisma.position.findFirstOrThrow({ where: { assetId: asset.id } })
      ).quantity.toString(),
    ).toBe('1.5');
    const { body: sale } = await pay().expect(201);
    expect((await pay().expect(201)).body.id).toBe(sale.id);
    await sync();
    const position = await prisma.position.findFirstOrThrow({
      where: { assetId: asset.id, accountId: account.id },
    });
    expect(position.quantity.toString()).toBe('1');
    expect(position.avgCost.toString()).toBe('200');
    const entries = await prisma.glEntry.findMany({
      where: { refTxId: sale.id, isDeleted: false },
      include: { lines: true },
    });
    expect(entries).toHaveLength(1);
    const lines = entries[0].lines;
    expect(
      lines.find((line) => line.note === 'sell proceeds in')!.amount.toString(),
    ).toBe('60');
    expect(
      lines
        .find((line) => line.note === 'sell cost basis out')!
        .amount.toString(),
    ).toBe('50');
    expect(
      lines.find((line) => line.note === 'realized gain')!.amount.toString(),
    ).toBe('10');
    expect(
      lines
        .reduce(
          (balance, line) =>
            balance.add(line.amount.mul(line.side === 'debit' ? 1 : -1)),
          new Prisma.Decimal(0),
        )
        .isZero(),
    ).toBe(true);
    expect(
      await prisma.transaction.count({
        where: { cashInLieuActionId: { not: null } },
      }),
    ).toBe(1);
  });

  it('can cash out an entirely fractional holding, including a zero-dollar payment', async () => {
    const { pay, asset } = await fixture([5]);
    await pay({ amount: '0' }).expect(201);
    expect(await prisma.position.count({ where: { assetId: asset.id } })).toBe(
      0,
    );
    const lot = await prisma.positionLot.findFirstOrThrow({
      where: { assetId: asset.id },
    });
    expect(lot.remainingQuantity.isZero()).toBe(true);
    expect(lot.closedAt).not.toBeNull();
  });

  it('preserves eight-decimal cash amounts in balanced GL entries', async () => {
    const { pay } = await fixture();
    const amount = '999999999999.12345678';
    const { body: sale } = await pay({ amount }).expect(201);
    const entry = await prisma.glEntry.findFirstOrThrow({
      where: { refTxId: sale.id, isDeleted: false },
      include: { lines: true },
    });
    expect(
      entry.lines
        .find((line) => line.note === 'sell proceeds in')!
        .amount.toString(),
    ).toBe(amount);
    expect(
      entry.lines
        .reduce(
          (balance, line) =>
            balance.add(line.amount.mul(line.side === 'debit' ? 1 : -1)),
          new Prisma.Decimal(0),
        )
        .isZero(),
    ).toBe(true);
  });

  it('replays a backdated buy against the already-synced reverse split', async () => {
    const { cookie, account, asset } = await fixture();
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Cookie', cookie)
      .send({
        accountId: account.id,
        assetId: asset.id,
        type: 'buy',
        quantity: 5,
        amount: 150,
        price: 30,
        tradeTime: '2025-06-03T12:00:00Z',
      })
      .expect(201);
    expect(
      (
        await prisma.position.findFirstOrThrow({ where: { assetId: asset.id } })
      ).quantity.toString(),
    ).toBe('2');
  });

  it('requires reconciliation when another split occurs before payment', async () => {
    const { pay, asset } = await fixture();
    await prisma.corporateAction.create({
      data: {
        assetId: asset.id,
        market: 'us',
        type: 'split',
        exDate: new Date('2025-06-19'),
        ratio: 2,
        source: 'test',
        sourceKey: 'later-split',
      },
    });
    await pay().expect(400);
    expect(
      await prisma.transaction.count({
        where: { cashInLieuActionId: { not: null } },
      }),
    ).toBe(0);
  });

  it('rejects another user and unauthenticated callers', async () => {
    const { action, body } = await fixture();
    const url = `/corp-actions/${action.id}/cash-in-lieu`;
    await request(app.getHttpServer()).post(url).send(body).expect(401);
    const other = await prisma.user.create({
      data: { email: 'other@test.local', passwordHash: '!' },
    });
    await request(app.getHttpServer())
      .post(url)
      .set('Cookie', authCookieFor(app, { id: other.id }))
      .send(body)
      .expect(404);
    expect(
      await prisma.transaction.count({
        where: { cashInLieuActionId: action.id },
      }),
    ).toBe(0);
  });

  it('rejects currency/quantity/date mismatches and conflicting retries', async () => {
    const { pay, cookie } = await fixture();
    await pay({ currency: 'TWD' }).expect(400);
    await pay({ quantity: '0.4' }).expect(400);
    await pay({ paidAt: '2025-06-17T12:00:00Z' }).expect(400);
    await pay({ amount: 'not-money' }).expect(400);
    const { body: sale } = await pay().expect(201);
    await pay({ amount: '61' }).expect(409);
    await request(app.getHttpServer())
      .patch(`/transactions/${sale.id}`)
      .set('Cookie', cookie)
      .send({ quantity: 1 })
      .expect(400);
  });

  it('rolls back transaction, lots and position if GL posting fails', async () => {
    const { pay, asset, action } = await fixture();
    const before = await prisma.position.findMany({
      where: { assetId: asset.id },
    });
    jest
      .spyOn(app.get(PostingService), 'postTransaction')
      .mockRejectedValueOnce(new Error('injected GL failure'));
    await pay().expect(500);
    expect(
      await prisma.transaction.count({
        where: { cashInLieuActionId: action.id },
      }),
    ).toBe(0);
    expect(
      await prisma.position.findMany({ where: { assetId: asset.id } }),
    ).toEqual(before);
  });
});
