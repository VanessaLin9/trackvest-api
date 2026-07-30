import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { ImportRowError } from './transaction-import-orchestration.types'

type ImportDbClient = Prisma.TransactionClient | PrismaService

/**
 * 帳內委託書號查重（PR #31 拆出；語意在 PR #36 定為 skipped）。
 * 找到既有交易 → preview/commit 標 skipped，不當成擋整批的 error。
 */
@Injectable()
export class ImportBrokerOrderDuplicateChecker {
  async findExistingInAccount(
    accountId: string,
    brokerOrderNo: string,
    rowNumber: number,
    db: ImportDbClient,
  ): Promise<ImportRowError | null> {
    const existingTransaction = await db.transaction.findFirst({
      where: {
        accountId,
        brokerOrderNo,
      },
      select: { id: true },
    })

    if (!existingTransaction) {
      return null
    }

    return {
      row: rowNumber,
      field: '委託書號',
      message: 'Duplicate broker order number for selected account',
    }
  }
}
