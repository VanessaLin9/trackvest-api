// src/gl/posting.service.ts
import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import type { Currency, Prisma, Transaction, TxType } from '@prisma/client'
import { OwnershipService } from '../common/services/ownership.service'
import { GlService } from './services/gl.service'
import {
  GlLineInput,
  validateGlLines,
} from '../common/utils/gl-validation.util'
import { toNumber } from '../common/utils/number.util'

type DbClient = Prisma.TransactionClient | PrismaService

@Injectable()
export class PostingService {
  constructor(
    private prisma: PrismaService,
    private ownershipService: OwnershipService,
    private glService: GlService,
  ) {}

  private getDb(db?: DbClient) {
    return db ?? this.prisma
  }

  async archiveTransactionEntries(
    userId: string,
    refTxId: string,
    db?: DbClient,
  ) {
    await this.getDb(db).glEntry.updateMany({
      where: { userId, refTxId, isDeleted: false },
      data: { isDeleted: true, deletedAt: new Date() },
    })
  }

  /** ---------- 共用守則 ---------- */
  private async createEntry(
    userId: string,
    date: Date,
    memo: string | undefined,
    source: string | undefined,
    lines: GlLineInput[],
    refTxId?: string,
    db?: DbClient,
  ) {
    const prisma = this.getDb(db)
    // Validate lines using utility functions
    validateGlLines(lines)

    // 冪等：同 user+refTxId 先軟刪舊分錄（或你也可改成 upsert by unique key）
    if (refTxId) {
      await this.archiveTransactionEntries(userId, refTxId, prisma)
    }

    return prisma.glEntry.create({
      data: {
        userId,
        date,
        memo,
        source,
        refTxId: refTxId ?? null,
        lines: { create: lines },
      },
      include: { lines: true },
    })
  }

  /** ---------- 科目查找器（委託給 GlAccountLookupService） ---------- */
  // All GL account lookup methods are now delegated to GlAccountLookupService

  /** ---------- 1) Transfer ---------- */
  async postTransfer(command: {
    userId: string
    fromGlAccountId: string
    toGlAccountId: string
    amount: number
    currency: Currency
    date: Date
    memo?: string
    source?: string
  }) {
    const { userId, fromGlAccountId, toGlAccountId, amount, currency, date, memo, source } = command

    // Validate GL account ownership
    await this.ownershipService.validateGlAccountOwnership(fromGlAccountId, userId)
    await this.ownershipService.validateGlAccountOwnership(toGlAccountId, userId)

    const lines: GlLineInput[] = [
      { glAccountId: toGlAccountId, side: 'debit', amount, currency, note: 'transfer in' },
      { glAccountId: fromGlAccountId, side: 'credit', amount, currency, note: 'transfer out' },
    ]
    return this.createEntry(userId, date, memo, source ?? 'manual:transfer', lines)
  }

  /** ---------- 2) Expense ---------- */
  async postExpense(command: {
    userId: string
    payFromGlAccountId: string
    expenseGlAccountId: string
    amount: number
    currency: Currency
    date: Date
    memo?: string
    source?: string
  }) {
    const { userId, payFromGlAccountId, expenseGlAccountId, amount, currency, date, memo, source } = command

    // Validate GL account ownership
    await this.ownershipService.validateGlAccountOwnership(payFromGlAccountId, userId)
    await this.ownershipService.validateGlAccountOwnership(expenseGlAccountId, userId)

    const lines: GlLineInput[] = [
      { glAccountId: expenseGlAccountId, side: 'debit', amount, currency, note: 'expense' },
      { glAccountId: payFromGlAccountId, side: 'credit', amount, currency, note: 'cash/bank out' },
    ]
    return this.createEntry(userId, date, memo, source ?? 'manual:expense', lines)
  }

  /** ---------- 3) Income ---------- */
  async postIncome(command: {
    userId: string
    receiveToGlAccountId: string
    incomeGlAccountId: string
    amount: number
    currency: Currency
    date: Date
    memo?: string
    source?: string
  }) {
    const { userId, receiveToGlAccountId, incomeGlAccountId, amount, currency, date, memo, source } = command

    // Validate GL account ownership
    await this.ownershipService.validateGlAccountOwnership(receiveToGlAccountId, userId)
    await this.ownershipService.validateGlAccountOwnership(incomeGlAccountId, userId)

    const lines: GlLineInput[] = [
      { glAccountId: receiveToGlAccountId, side: 'debit', amount, currency, note: 'cash/bank in' },
      { glAccountId: incomeGlAccountId, side: 'credit', amount, currency, note: 'income' },
    ]
    return this.createEntry(userId, date, memo, source ?? 'manual:income', lines)
  }

  /** ---------- 4) 自動過帳：依交易型別 ---------- */
  async postTransaction(command: { userId: string; transaction: Transaction; db?: DbClient }) {
    const { userId, transaction: tx, db } = command
    const prisma = this.getDb(db)
    // 交易使用的幣別以帳戶幣別為準（v1 簡化）
    const account = await prisma.account.findUniqueOrThrow({ where: { id: tx.accountId } })
    const ccy = account.currency as Currency
    const date = tx.tradeTime

    // 取對應現金 GL（由 account 關聯）
    const cashGlId = await this.glService.getLinkedCashGlAccountId(account.id, prisma)

    switch (tx.type as TxType) {
      case 'deposit': {
        // 銀行 → 券商（或其他來源 → 此帳戶）
        // v1：用 transfer 模式，但來源你可能沒有指定；這裡先記成「未知來源收入」或你額外傳 fromGlAccountId
        // 建議：若此 Tx 代表「外部注入到本帳戶」，就 debit 現金、credit「權益-投入資本」或「收入-其他」；先簡化為權益。
        const equityGlId = await this.glService.getEquityGlAccountId(userId, prisma)
        const lines: GlLineInput[] = [
          { glAccountId: cashGlId, side: 'debit', amount: toNumber(tx.amount), currency: ccy, note: 'deposit in' },
          { glAccountId: equityGlId, side: 'credit', amount: toNumber(tx.amount), currency: ccy, note: 'owner contribution' },
        ]
        return this.createEntry(userId, date, tx.note ?? undefined, 'auto:transaction:deposit', lines, tx.id, prisma)
      }
      case 'withdraw': {
        const equityGlId = await this.glService.getEquityGlAccountId(userId, prisma)
        const lines: GlLineInput[] = [
          { glAccountId: equityGlId, side: 'debit', amount: toNumber(tx.amount), currency: ccy, note: 'owner draw' },
          { glAccountId: cashGlId, side: 'credit', amount: toNumber(tx.amount), currency: ccy, note: 'withdraw out' },
        ]
        return this.createEntry(userId, date, tx.note ?? undefined, 'auto:transaction:withdraw', lines, tx.id, prisma)
      }
      case 'buy': {
        // 成本處理：v1 將手續費併入成本（或改為單列費用）
        const investGlId = await this.glService.getInvestmentBucketGlAccountId(userId, ccy, prisma)
        const gross = toNumber(tx.quantity) * toNumber(tx.price)
        const fee = toNumber(tx.fee)
        const total = toNumber(tx.amount) || (gross + fee) // 以 tx.amount 優先，否則自行計
        const lines: GlLineInput[] = [
          { glAccountId: investGlId, side: 'debit', amount: total, currency: ccy, note: 'buy cost(+fee)' },
          { glAccountId: cashGlId,   side: 'credit', amount: total, currency: ccy, note: 'cash out' },
        ]
        return this.createEntry(userId, date, tx.note ?? undefined, 'auto:transaction:buy', lines, tx.id, prisma)
      }
      case 'sell': {
        throw new BadRequestException(
          'Sell transactions are temporarily disabled until cost basis tracking is implemented',
        )
      }
      case 'dividend': {
        const divGlId = await this.glService.getDividendIncomeGlAccountId(userId, prisma)
        const amt = toNumber(tx.amount)
        // 若有稅，v1 可直接把稅額寫在 note，或再開「稅費」科目
        const lines: GlLineInput[] = [
          { glAccountId: cashGlId, side: 'debit', amount: amt, currency: ccy, note: 'dividend in' },
          { glAccountId: divGlId, side: 'credit', amount: amt, currency: ccy, note: 'dividend income' },
        ]
        return this.createEntry(userId, date, tx.note ?? undefined, 'auto:transaction:dividend', lines, tx.id, prisma)
      }
      case 'fee': {
        const feeGlId = await this.glService.getFeeExpenseGlAccountId(userId, prisma)
        const amt = toNumber(tx.amount) || toNumber(tx.fee)
        const lines: GlLineInput[] = [
          { glAccountId: feeGlId,  side: 'debit', amount: amt, currency: ccy, note: 'fee expense' },
          { glAccountId: cashGlId, side: 'credit', amount: amt, currency: ccy, note: 'cash out' },
        ]
        return this.createEntry(userId, date, tx.note ?? undefined, 'auto:transaction:fee', lines, tx.id, prisma)
      }
      default:
        throw new BadRequestException(`Unsupported tx.type: ${tx.type}`)
    }
  }
}
