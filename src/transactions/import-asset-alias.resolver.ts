import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { normalizeAssetNameInput } from '../common/utils'
import { PrismaService } from '../prisma.service'

type ImportDbClient = Prisma.TransactionClient | PrismaService

@Injectable()
export class ImportAssetAliasResolver {
  async resolve(
    alias: string,
    broker: string,
    db: ImportDbClient,
  ): Promise<string | null> {
    const normalizedAlias = normalizeAssetNameInput(alias)
    if (!normalizedAlias) {
      return null
    }

    const brokerAlias = await db.assetAlias.findUnique({
      where: {
        alias_broker: {
          alias: normalizedAlias,
          broker,
        },
      },
      select: { assetId: true },
    })
    if (brokerAlias) {
      return brokerAlias.assetId
    }

    const globalAlias = await db.assetAlias.findUnique({
      where: {
        alias_broker: {
          alias: normalizedAlias,
          broker: '',
        },
      },
      select: { assetId: true },
    })

    return globalAlias?.assetId ?? null
  }
}
