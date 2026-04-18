import { ConflictException, NotFoundException } from '@nestjs/common'
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

  it('deletes an asset after confirming it exists', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1' })
    prisma.asset.delete.mockResolvedValue({ id: 'asset-1' })

    await service.remove('asset-1')

    expect(prisma.asset.delete).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
    })
  })
})
