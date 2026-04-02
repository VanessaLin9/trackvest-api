import { AssetType } from '@prisma/client'
import { AssetsController } from './assets.controller'

describe('AssetsController', () => {
  function createHarness() {
    const service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findBySymbol: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    }

    const controller = new AssetsController(service as never)

    return { controller, service }
  }

  const asset = {
    id: 'asset-1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    type: AssetType.equity,
    baseCurrency: 'USD',
  }

  it('creates an asset through the service and returns the exposed fields', async () => {
    const { controller, service } = createHarness()
    service.create.mockResolvedValue(asset)

    const result = await controller.create({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: AssetType.equity,
      baseCurrency: 'USD',
    })

    expect(service.create).toHaveBeenCalledWith({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: AssetType.equity,
      baseCurrency: 'USD',
    })
    expect(result).toEqual(asset)
  })

  it('passes list query filters to the service and maps the response array', async () => {
    const { controller, service } = createHarness()
    service.findAll.mockResolvedValue([asset])

    const query = {
      search: 'apple',
      symbol: 'AAPL',
      type: AssetType.equity,
      baseCurrency: 'USD',
      skip: 0,
      take: 50,
    }
    const result = await controller.findAll(query)

    expect(service.findAll).toHaveBeenCalledWith(query)
    expect(result).toEqual([asset])
  })

  it('looks up an asset by symbol', async () => {
    const { controller, service } = createHarness()
    service.findBySymbol.mockResolvedValue(asset)

    const result = await controller.findBySymbol('AAPL')

    expect(service.findBySymbol).toHaveBeenCalledWith('AAPL')
    expect(result).toEqual(asset)
  })

  it('looks up an asset by id', async () => {
    const { controller, service } = createHarness()
    service.findOne.mockResolvedValue(asset)

    const result = await controller.findOne('asset-1')

    expect(service.findOne).toHaveBeenCalledWith('asset-1')
    expect(result).toEqual(asset)
  })

  it('updates an asset through the service', async () => {
    const { controller, service } = createHarness()
    service.update.mockResolvedValue(asset)

    const payload = {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: AssetType.equity,
      baseCurrency: 'USD',
    }
    const result = await controller.update('asset-1', payload)

    expect(service.update).toHaveBeenCalledWith('asset-1', payload)
    expect(result).toEqual(asset)
  })

  it('removes an asset through the service', async () => {
    const { controller, service } = createHarness()
    service.remove.mockResolvedValue(asset)

    const result = await controller.remove('asset-1')

    expect(service.remove).toHaveBeenCalledWith('asset-1')
    expect(result).toEqual(asset)
  })
})
