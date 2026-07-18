import { ImportAssetAliasResolver } from './import-asset-alias.resolver'

describe('ImportAssetAliasResolver', () => {
  function createHarness() {
    const prisma = {
      assetAlias: {
        findUnique: jest.fn(),
      },
    }

    const resolver = new ImportAssetAliasResolver()

    return { resolver, prisma }
  }

  it('normalizes alias text before broker-specific and global lookups', async () => {
    const { resolver, prisma } = createHarness()
    prisma.assetAlias.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ assetId: 'asset-global' })

    const assetId = await resolver.resolve('  國泰台灣  領袖50 ', 'cathay', prisma as never)

    expect(prisma.assetAlias.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        alias_broker: {
          alias: '國泰台灣 領袖50',
          broker: 'cathay',
        },
      },
      select: { assetId: true },
    })
    expect(prisma.assetAlias.findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        alias_broker: {
          alias: '國泰台灣 領袖50',
          broker: '',
        },
      },
      select: { assetId: true },
    })
    expect(assetId).toBe('asset-global')
  })

  it('prefers a broker-specific alias over the global fallback', async () => {
    const { resolver, prisma } = createHarness()
    prisma.assetAlias.findUnique.mockResolvedValueOnce({ assetId: 'asset-cathay' })

    const assetId = await resolver.resolve('國泰台灣領袖50', 'cathay', prisma as never)

    expect(prisma.assetAlias.findUnique).toHaveBeenCalledTimes(1)
    expect(assetId).toBe('asset-cathay')
  })

  it('returns null for a blank normalized alias without querying', async () => {
    const { resolver, prisma } = createHarness()

    const assetId = await resolver.resolve('   ', 'cathay', prisma as never)

    expect(prisma.assetAlias.findUnique).not.toHaveBeenCalled()
    expect(assetId).toBeNull()
  })
})
