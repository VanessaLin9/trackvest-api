import { ConflictException, Injectable } from '@nestjs/common'
import { Currency, GlAccount, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import {
  buildDefaultSystemGlAccountCreateData,
  DEFAULT_SYSTEM_GL_PURPOSES,
} from './default-chart.definitions'

type DbClient = Prisma.TransactionClient | PrismaService

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
