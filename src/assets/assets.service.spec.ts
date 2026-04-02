import { ConflictException, NotFoundException } from '@nestjs/common'
import { AssetsService } from './assets.service'

describe('AssetsService', () => {
  function createHarness() {
    const prisma = {
      asset: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    }

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
        baseCurrency: 'USD',
      },
    })
  })

  it('applies search, filter, and pagination when listing assets', async () => {
    const { service, prisma } = createHarness()
    prisma.asset.findMany.mockResolvedValue([])

    await service.findAll({
      search: '  apple   inc ',
      symbol: ' aapl ',
      type: 'equity',
      baseCurrency: ' usd ',
      skip: 5,
      take: 20,
    })

    expect(prisma.asset.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { symbol: { contains: 'apple inc', mode: 'insensitive' } },
          { name: { contains: 'apple inc', mode: 'insensitive' } },
        ],
        symbol: 'AAPL',
        type: 'equity',
        baseCurrency: 'USD',
      },
      orderBy: { symbol: 'asc' },
      skip: 5,
      take: 20,
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
        baseCurrency: ' usd ',
      }),
    ).rejects.toThrow(
      new ConflictException('Asset with this symbol already exists'),
    )
  })
})
