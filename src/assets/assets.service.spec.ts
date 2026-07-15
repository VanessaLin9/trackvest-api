import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AssetAliasConflictException } from './asset-alias-conflict.exception'
import { AssetsService } from './assets.service'

describe('AssetsService', () => {
  function createHarness() {
    const prisma = {
      $transaction: jest.fn(),
      asset: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      assetAlias: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    }
    prisma.$transaction.mockImplementation(
      async (callback: (db: typeof prisma) => Promise<unknown>) => callback(prisma),
    )

    const service = new AssetsService(prisma as never)

    return { service, prisma }
  }

  it('normalizes create payload before uniqueness checks and persistence', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue(null)
    prisma.asset.create.mockResolvedValue({ id: 'asset-1' })

    await service.create({
      symbol: '  aapl ',
      name: ' Apple   Inc. ',
      type: 'equity',
      assetClass: 'equity',
      baseCurrency: ' usd ',
    })

    expect(prisma.asset.findUnique).toHaveBeenCalledWith({
      where: { symbol: 'AAPL' },
    })
    expect(prisma.asset.create).toHaveBeenCalledWith({
      data: {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: 'USD',
      },
    })
  })

  it('infers assetClass for non-etf assets when it is omitted', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue(null)
    prisma.asset.create.mockResolvedValue({ id: 'asset-1' })

    await service.create({
      symbol: '  aapl ',
      name: ' Apple   Inc. ',
      type: 'equity',
      baseCurrency: ' usd ',
    })

    expect(prisma.asset.create).toHaveBeenCalledWith({
      data: {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: 'USD',
      },
    })
  })

  it('infers assetClass for known bond etfs when it is omitted', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue(null)
    prisma.asset.create.mockResolvedValue({ id: 'asset-1' })

    await service.create({
      symbol: ' bndw ',
      name: ' Vanguard   Total  World Bond ETF ',
      type: 'etf',
      baseCurrency: ' usd ',
    })

    expect(prisma.asset.create).toHaveBeenCalledWith({
      data: {
        symbol: 'BNDW',
        name: 'Vanguard Total World Bond ETF',
        type: 'etf',
        assetClass: 'bond',
        baseCurrency: 'USD',
      },
    })
  })

  it('rejects ambiguous etfs when assetClass is omitted', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue(null)

    await expect(
      service.create({
        symbol: 'vtip',
        name: 'Vanguard Short-Term Inflation-Protected Securities ETF',
        type: 'etf',
        baseCurrency: 'usd',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'assetClass is required for etf assets when it cannot be inferred automatically',
      ),
    )
  })

  it('rejects incompatible assetClass values for non-etf assets', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue(null)

    await expect(
      service.create({
        symbol: 'aapl',
        name: 'Apple Inc.',
        type: 'equity',
        assetClass: 'bond',
        baseCurrency: 'usd',
      }),
    ).rejects.toThrow(
      new BadRequestException('equity assets must use assetClass "equity"'),
    )
  })

  it('throws conflict when a normalized create symbol already exists', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', symbol: 'AAPL' })

    await expect(
      service.create({
        symbol: ' aapl ',
        name: 'Apple Inc.',
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: 'usd',
      }),
    ).rejects.toThrow(
      new ConflictException('Asset with this symbol already exists'),
    )
  })

  it('filters first and then paginates asset results', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findMany.mockResolvedValue([])
    prisma.asset.count.mockResolvedValue(23)

    const result = await service.findAll({
      q: '  apple   inc ',
      type: 'equity',
      assetClass: 'equity',
      baseCurrency: ' usd ',
      page: 3,
      take: 10,
    })

    expect(prisma.asset.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { symbol: { contains: 'apple inc', mode: 'insensitive' } },
          { name: { contains: 'apple inc', mode: 'insensitive' } },
        ],
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: 'USD',
      },
      orderBy: { symbol: 'asc' },
      skip: 20,
      take: 10,
    })
    expect(prisma.asset.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { symbol: { contains: 'apple inc', mode: 'insensitive' } },
          { name: { contains: 'apple inc', mode: 'insensitive' } },
        ],
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: 'USD',
      },
    })
    expect(result).toEqual({
      items: [],
      total: 23,
      page: 3,
      take: 10,
    })
  })

  it('returns default first-page pagination when no filters are provided', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findMany.mockResolvedValue([])
    prisma.asset.count.mockResolvedValue(0)

    const result = await service.findAll()

    expect(prisma.asset.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { symbol: 'asc' },
      skip: 0,
      take: 10,
    })
    expect(result).toEqual({
      items: [],
      total: 0,
      page: 1,
      take: 10,
    })
  })

  it('normalizes the symbol when looking up by symbol', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      symbol: 'AAPL',
    })

    await service.findBySymbol(' aapl ')

    expect(prisma.asset.findUnique).toHaveBeenCalledWith({
      where: { symbol: 'AAPL' },
    })
  })

  it('throws not found when findBySymbol misses', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue(null)

    await expect(service.findBySymbol('missing')).rejects.toThrow(
      new NotFoundException('Asset not found'),
    )
  })

  it('throws conflict when an updated symbol collides after normalization', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' })
    prisma.asset.findFirst.mockResolvedValue({ id: 'asset-2' })

    await expect(
      service.update('asset-1', {
        symbol: ' aapl ',
        name: 'Apple Inc.',
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: ' usd ',
      }),
    ).rejects.toThrow(
      new ConflictException('Asset with this symbol already exists'),
    )
  })

  it('updates an asset with normalized payload when there is no collision', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' })
    prisma.asset.findFirst.mockResolvedValue(null)
    prisma.asset.update.mockResolvedValue({ id: 'asset-1', symbol: 'MSFT' })

    await service.update('asset-1', {
      symbol: ' msft ',
      name: ' Microsoft   Corp ',
      type: 'equity',
      assetClass: 'equity',
      baseCurrency: ' usd ',
    })

    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        symbol: 'MSFT',
        name: 'Microsoft Corp',
        type: 'equity',
        assetClass: 'equity',
        baseCurrency: 'USD',
      },
    })
  })

  it('reuses the stored assetClass on update when an etf omits assetClass', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({
      id: 'asset-1',
      assetClass: 'bond',
    })
    prisma.asset.findFirst.mockResolvedValue(null)
    prisma.asset.update.mockResolvedValue({ id: 'asset-1', symbol: 'VTIP' })

    await service.update('asset-1', {
      symbol: ' vtip ',
      name: ' Vanguard Short-Term Inflation-Protected Securities ETF ',
      type: 'etf',
      baseCurrency: ' usd ',
    })

    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        symbol: 'VTIP',
        name: 'Vanguard Short-Term Inflation-Protected Securities ETF',
        type: 'etf',
        assetClass: 'bond',
        baseCurrency: 'USD',
      },
    })
  })

  it('infers assetClass during update when it is omitted', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' })
    prisma.asset.findFirst.mockResolvedValue(null)
    prisma.asset.update.mockResolvedValue({ id: 'asset-1', symbol: 'SGOV' })

    await service.update('asset-1', {
      symbol: ' sgov ',
      name: ' iShares  0-3 Month Treasury Bond ETF ',
      type: 'etf',
      baseCurrency: ' usd ',
    })

    expect(prisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        symbol: 'SGOV',
        name: 'iShares 0-3 Month Treasury Bond ETF',
        type: 'etf',
        assetClass: 'bond',
        baseCurrency: 'USD',
      },
    })
  })

  it('deletes an asset after confirming it exists', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' })
    prisma.asset.delete.mockResolvedValue({ id: 'asset-1' })

    await service.remove('asset-1')

    expect(prisma.asset.delete).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
    })
  })

  describe('createAlias', () => {
    const targetAsset = {
      id: 'asset-1',
      symbol: '00900',
      name: '國泰台灣領袖50',
    }

    const mapping = {
      id: 'alias-1',
      assetId: 'asset-1',
      alias: '國泰台灣領袖50',
      broker: 'cathay',
      asset: targetAsset,
    }

    it('normalizes alias text before lookup and persistence', async () => {
      const { service, prisma } = createHarness()
      prisma.asset.findUnique.mockResolvedValue(targetAsset)
      prisma.assetAlias.findUnique.mockResolvedValue(null)
      prisma.assetAlias.create.mockResolvedValue(mapping)

      await service.createAlias('asset-1', {
        alias: '  國泰台灣  領袖50 ',
        broker: 'cathay',
      })

      expect(prisma.assetAlias.findUnique).toHaveBeenCalledWith({
        where: {
          alias_broker: {
            alias: '國泰台灣 領袖50',
            broker: 'cathay',
          },
        },
        include: {
          asset: {
            select: { id: true, symbol: true, name: true },
          },
        },
      })
      expect(prisma.assetAlias.create).toHaveBeenCalledWith({
        data: {
          assetId: 'asset-1',
          alias: '國泰台灣 領袖50',
          broker: 'cathay',
        },
        include: {
          asset: {
            select: { id: true, symbol: true, name: true },
          },
        },
      })
    })

    it('creates a Cathay-specific alias for an existing Asset', async () => {
      const { service, prisma } = createHarness()
      prisma.asset.findUnique.mockResolvedValue(targetAsset)
      prisma.assetAlias.findUnique.mockResolvedValue(null)
      prisma.assetAlias.create.mockResolvedValue(mapping)

      const result = await service.createAlias('asset-1', {
        alias: '國泰台灣領袖50',
        broker: 'cathay',
      })

      expect(result).toEqual(mapping)
    })

    it('returns an idempotent success when the same pair maps to the same Asset', async () => {
      const { service, prisma } = createHarness()
      prisma.asset.findUnique.mockResolvedValue(targetAsset)
      prisma.assetAlias.findUnique.mockResolvedValue(mapping)

      const result = await service.createAlias('asset-1', {
        alias: '國泰台灣領袖50',
        broker: 'cathay',
      })

      expect(result).toEqual(mapping)
      expect(prisma.assetAlias.create).not.toHaveBeenCalled()
    })

    it('returns a typed conflict when the pair maps to another Asset', async () => {
      const { service, prisma } = createHarness()
      const otherAsset = {
        id: 'asset-2',
        symbol: '0050',
        name: '元大台灣50',
      }
      prisma.asset.findUnique.mockResolvedValue(targetAsset)
      prisma.assetAlias.findUnique.mockResolvedValue({
        id: 'alias-existing',
        assetId: 'asset-2',
        alias: '國泰台灣領袖50',
        broker: 'cathay',
        asset: otherAsset,
      })

      let thrown: unknown
      try {
        await service.createAlias('asset-1', {
          alias: '國泰台灣領袖50',
          broker: 'cathay',
        })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(AssetAliasConflictException)
      expect((thrown as AssetAliasConflictException).getResponse()).toEqual({
        code: 'ASSET_ALIAS_CONFLICT',
        message: 'Asset alias already maps to another asset',
        existingAsset: otherAsset,
      })
      expect(prisma.assetAlias.create).not.toHaveBeenCalled()
    })

    it('resolves a unique-constraint race to idempotent success', async () => {
      const { service, prisma } = createHarness()
      prisma.asset.findUnique.mockResolvedValue(targetAsset)
      prisma.assetAlias.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mapping)
      prisma.assetAlias.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      )

      const result = await service.createAlias('asset-1', {
        alias: '國泰台灣領袖50',
        broker: 'cathay',
      })

      expect(result).toEqual(mapping)
    })

    it('resolves a unique-constraint race to typed conflict', async () => {
      const { service, prisma } = createHarness()
      const otherAsset = {
        id: 'asset-2',
        symbol: '0050',
        name: '元大台灣50',
      }
      prisma.asset.findUnique.mockResolvedValue(targetAsset)
      prisma.assetAlias.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'alias-existing',
          assetId: 'asset-2',
          alias: '國泰台灣領袖50',
          broker: 'cathay',
          asset: otherAsset,
        })
      prisma.assetAlias.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      )

      await expect(
        service.createAlias('asset-1', {
          alias: '國泰台灣領袖50',
          broker: 'cathay',
        }),
      ).rejects.toBeInstanceOf(AssetAliasConflictException)
    })

    it('rejects a missing target Asset', async () => {
      const { service, prisma } = createHarness()
      prisma.asset.findUnique.mockResolvedValue(null)

      await expect(
        service.createAlias('missing-asset', {
          alias: '國泰台灣領袖50',
          broker: 'cathay',
        }),
      ).rejects.toThrow(new NotFoundException('Asset not found'))

      expect(prisma.assetAlias.create).not.toHaveBeenCalled()
    })

    it('rejects a blank normalized alias', async () => {
      const { service, prisma } = createHarness()

      await expect(
        service.createAlias('asset-1', {
          alias: '   ',
          broker: 'cathay',
        }),
      ).rejects.toThrow(new BadRequestException('alias must not be empty'))

      expect(prisma.asset.findUnique).not.toHaveBeenCalled()
      expect(prisma.assetAlias.create).not.toHaveBeenCalled()
    })
  })
})
