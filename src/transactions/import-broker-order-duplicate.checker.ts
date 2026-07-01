import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { ImportRowError } from './transaction-import-orchestration.types'

@Injectable()
export class ImportBrokerOrderDuplicateChecker {
  constructor(private prisma: PrismaService) {}

  async findExistingInAccount(
    accountId: string,
    brokerOrderNo: string,
    rowNumber: number,
  ): Promise<ImportRowError | null> {
    const existingTransaction = await this.prisma.transaction.findFirst({
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
