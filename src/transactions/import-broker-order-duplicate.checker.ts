import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { ImportRowError } from './transaction-import-orchestration.types'

type ImportDbClient = Prisma.TransactionClient | PrismaService

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
