import { Injectable } from '@nestjs/common'
import { normalizeAssetNameInput } from '../common/utils'
import { PrismaService } from '../prisma.service'

@Injectable()
export class ImportAssetAliasResolver {
  constructor(private prisma: PrismaService) {}

  async resolve(alias: string, broker: string): Promise<string | null> {
    const normalizedAlias = normalizeAssetNameInput(alias)
    if (!normalizedAlias) {
      return null
    }

    const brokerAlias = await this.prisma.assetAlias.findUnique({
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

    const globalAlias = await this.prisma.assetAlias.findUnique({
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
