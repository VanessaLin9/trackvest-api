import { ConflictException, Injectable } from '@nestjs/common'
import { Currency, GlAccount, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import {
  buildDefaultSystemGlAccountCreateData,
  DEFAULT_SYSTEM_GL_PURPOSES,
} from './default-chart.definitions'

type DbClient = Prisma.TransactionClient | PrismaService

/**
 * 為新 user 建立 posting 所需的預設系統 GL 科目（PR #32）。
 * 同 user+currency 若已有任一 purpose → Conflict，避免重複 provision。
 */
@Injectable()
export class DefaultChartProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  private getDb(db?: DbClient): DbClient {
    return db ?? this.prisma
  }

  async provisionSystemAccounts(
    userId: string,
    currency: Currency = Currency.TWD,
    db?: DbClient,
  ): Promise<GlAccount[]> {
    const prisma = this.getDb(db)
    const definitions = buildDefaultSystemGlAccountCreateData(userId, currency)

    const existing = await prisma.glAccount.findMany({
      where: {
        userId,
        currency,
        purpose: { in: [...DEFAULT_SYSTEM_GL_PURPOSES] },
      },
      select: { id: true, purpose: true },
    })

    if (existing.length > 0) {
      throw new ConflictException(
        'Default system GL accounts already exist for this user',
      )
    }

    const created: GlAccount[] = []
    for (const data of definitions) {
      created.push(await prisma.glAccount.create({ data }))
    }

    return created
  }
}
