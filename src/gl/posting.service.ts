// src/gl/posting.service.ts
import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { Currency, GlSide } from '@prisma/client'

@Injectable()
export class PostingService {
  constructor(private prisma: PrismaService) {}

  private ensureBalanced(lines: { side: GlSide; amount: number }[]) {
    const debit = lines.filter(l => l.side === 'debit').reduce((a, b) => a + b.amount, 0)
    const credit = lines.filter(l => l.side === 'credit').reduce((a, b) => a + b.amount, 0)
    if (Math.abs(debit - credit) > 1e-9) {
      throw new BadRequestException(`Entry not balanced: debit=${debit}, credit=${credit}`)
    }
  }

  async postTransfer(userId: string, params: {
    fromGlAccountId: string
    toGlAccountId: string
    amount: number
    currency: Currency
    date: Date
    memo?: string
    source?: string
  }) {
    const { fromGlAccountId, toGlAccountId, amount, currency, date, memo, source } = params
    if (amount <= 0) throw new BadRequestException('amount must be > 0')

    const lines = [
      { glAccountId: toGlAccountId, side: 'debit' as GlSide, amount, currency, note: 'transfer in' },
      { glAccountId: fromGlAccountId, side: 'credit' as GlSide, amount, currency, note: 'transfer out' },
    ]
    this.ensureBalanced(lines)

    return this.prisma.glEntry.create({
      data: {
        userId, date, memo, source,
        lines: { create: lines },
      },
      include: { lines: true },
    })
  }

  // TODO: postExpense, postIncome, postTransaction(tx)
}
