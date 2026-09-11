import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PostingService } from '../gl/posting.service';
import { CashInLieuDto } from './dto/cash-in-lieu.dto';
import { PositionReplayService } from './position-replay.service';
import { replayScopeLedger } from './position-replay.engine';
import { CorpActionMarket } from './corp-action.types';

@Injectable()
export class CashInLieuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly replay: PositionReplayService,
    private readonly posting: PostingService,
  ) {}

  async record(actionId: string, input: CashInLieuDto, userId: string) {
    const amount = new Prisma.Decimal(input.amount);
    const quantity = new Prisma.Decimal(input.quantity);
    const paidAt = new Date(input.paidAt);
    if (
      !amount.isFinite() ||
      amount.isNegative() ||
      !quantity.gt(0) ||
      !quantity.lt(1) ||
      !Number.isFinite(paidAt.getTime()) ||
      paidAt > new Date() ||
      !input.reference.trim()
    ) {
      throw new BadRequestException('Invalid broker cash-in-lieu payment');
    }
    try {
      return await this.prisma.$transaction(
        async (db) => {
          // Require the actual owner, including for admin callers.
          const account = await db.account.findFirst({
            where: { id: input.accountId, userId },
          });
          if (!account) throw new NotFoundException('Account not found');
          const action = await db.corporateAction.findUnique({
            where: { id: actionId },
            include: { asset: true },
          });
          if (!action)
            throw new NotFoundException('Corporate action not found');
          if (
            action.type !== 'reverse_split' ||
            !action.ratio.gt(0) ||
            !action.ratio.lt(1)
          ) {
            throw new BadRequestException(
              'Cash-in-lieu requires a reverse split',
            );
          }
          if (
            account.type !== 'broker' ||
            account.currency !== input.currency ||
            action.asset.baseCurrency !== input.currency
          ) {
            throw new BadRequestException(
              'Broker account, asset and payment currencies must match',
            );
          }
          if (paidAt < action.exDate)
            throw new BadRequestException('Payment cannot precede the split');
          const existing = await db.transaction.findUnique({
            where: {
              accountId_cashInLieuActionId: {
                accountId: account.id,
                cashInLieuActionId: action.id,
              },
            },
          });
          const note = `Cash in lieu: ${input.reference.trim()}`;
          if (existing) {
            if (
              !existing.isDeleted &&
              existing.amount.equals(amount) &&
              existing.quantity?.equals(quantity) &&
              existing.tradeTime.getTime() === paidAt.getTime() &&
              existing.note === note
            )
              return existing;
            throw new ConflictException(
              'A different or deleted settlement already exists for this action and account',
            );
          }
          const actions = await db.corporateAction.findMany({
            where: { assetId: action.assetId, exDate: { lte: paidAt } },
            orderBy: [{ exDate: 'asc' }, { id: 'asc' }],
          });
          if (actions.some((other) => other.exDate > action.exDate)) {
            throw new BadRequestException(
              'Intervening corporate actions require reconciliation before cash-in-lieu can be recorded',
            );
          }
          const history = await db.transaction.findMany({
            where: {
              accountId: account.id,
              assetId: action.assetId,
              isDeleted: false,
              type: { in: ['buy', 'sell'] },
              tradeTime: { lt: action.exDate },
            },
            orderBy: [{ tradeTime: 'asc' }, { id: 'asc' }],
          });
          const ledger = replayScopeLedger({
            transactions: history.map((tx) => ({
              id: tx.id,
              type: tx.type as 'buy' | 'sell',
              tradeTime: tx.tradeTime,
              quantity: tx.quantity!.toNumber(),
              amount: tx.amount.toNumber(),
            })),
            corporateActions: actions.map((event) => ({
              exDate: event.exDate,
              ratio: event.ratio.toNumber(),
              market: event.market as CorpActionMarket,
            })),
          });
          // The replay engine's public numeric result can contain a binary
          // floating-point tail after summing multiple lots (e.g.
          // 0.1 + 0.1 + 0.1). Normalize only this externally reported
          // fractional entitlement before comparing it with the broker's
          // Decimal quantity; the persisted settlement remains Decimal.
          const entitlement = new Prisma.Decimal(
            ledger.position?.quantity ?? 0,
          ).toDecimalPlaces(12).mod(1);
          if (!entitlement.equals(quantity)) {
            throw new BadRequestException(
              `Broker quantity does not match fractional entitlement (${entitlement.toString()})`,
            );
          }
          const transaction = await db.transaction.create({
            data: {
              accountId: account.id,
              assetId: action.assetId,
              cashInLieuActionId: action.id,
              type: 'sell',
              amount,
              quantity,
              price: amount.div(quantity),
              fee: 0,
              tax: 0,
              tradeTime: paidAt,
              note,
            },
          });
          const saleIds = await this.replay.rebuildScope(db, {
            accountId: account.id,
            assetId: action.assetId,
          });
          const sales = await db.transaction.findMany({
            where: { id: { in: saleIds } },
          });
          for (const sale of sales) {
            await this.posting.postTransaction({
              userId,
              transaction: sale,
              db,
            });
          }
          return transaction;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        throw new ConflictException(
          'The account changed concurrently; retry the same settlement request',
        );
      }
      throw error;
    }
  }
}
