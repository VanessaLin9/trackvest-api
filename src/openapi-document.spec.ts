import { readFileSync } from 'fs'
import { createOpenApiDocument, OPENAPI_PATH } from '../scripts/export-openapi'

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return value as JsonObject
}

describe('openapi.json', () => {
  let committed: JsonObject

  beforeAll(() => {
    committed = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8')) as JsonObject
  })

  it('matches the document built from the controllers', async () => {
    const generated = await createOpenApiDocument()
    expect(JSON.stringify(generated, null, 2) + '\n').toBe(readFileSync(OPENAPI_PATH, 'utf8'))
  })

  it('describes one transaction page whose amounts are strings', () => {
    const paths = asObject(committed.paths)
    const transactions = asObject(paths['/transactions'])
    const get = asObject(transactions.get)
    const responses = asObject(get.responses)
    const ok = asObject(responses['200'])
    const content = asObject(ok.content)
    const json = asObject(content['application/json'])
    const schema = asObject(json.schema)
    expect(schema.$ref).toBe('#/components/schemas/TransactionListResponseDto')

    const components = asObject(committed.components)
    const schemas = asObject(components.schemas)
    const transaction = asObject(schemas.TransactionResponseDto)
    const transactionProperties = asObject(transaction.properties)
    expect(asObject(transactionProperties.amount).type).toBe('string')

    const list = asObject(schemas.TransactionListResponseDto)
    expect(asObject(list.properties).items).toBeDefined()
  })

  it('describes structured holding activity and the user role enum', () => {
    const schemas = asObject(asObject(committed.components).schemas)
    const holding = asObject(asObject(schemas.PortfolioHoldingItemResponseDto).properties)
    expect(holding.lastActivitySummary).toBeUndefined()
    const lastActivity = asObject(holding.lastActivity)
    const allOf = lastActivity.allOf as Array<{ $ref?: string }>
    expect(allOf[0]?.$ref).toBe('#/components/schemas/PortfolioHoldingLastActivityDto')

    const role = asObject(asObject(asObject(schemas.AuthUserDto).properties).role)
    expect(role.enum).toEqual(['admin', 'user'])
  })

  it('exports the asset-performance read route and decimal-string schemas', () => {
    const schemas = asObject(asObject(committed.components).schemas)
    const item = asObject(schemas.PortfolioAssetPerformanceItemResponseDto)
    const properties = asObject(item.properties)
    const required = item.required as string[]
    expect(required.slice().sort()).toEqual(Object.keys(properties).sort())
    for (const key of ['quantity', 'realizedQuantity', 'realizedNetPnl', 'remainingCost', 'latestPrice', 'unrealizedPnl', 'tradeNetPnl', 'recordedDividendAmount']) {
      expect(asObject(properties[key]).type).toBe('string')
    }
    for (const key of ['realizedQuantity', 'realizedNetPnl', 'remainingCost', 'latestPrice', 'priceAsOf', 'priceSource', 'unrealizedPnl', 'tradeNetPnl', 'recordedDividendAmount', 'firstBuyAt']) {
      expect(asObject(properties[key]).nullable).toBe(true)
    }
    expect(asObject(properties.recordedDividendCount).type).toBe('integer')
    expect(asObject(schemas.PortfolioAssetPerformanceStatus).enum).toEqual(['holding', 'closed'])
    expect(asObject(schemas.PortfolioAssetPerformanceIssue).enum).toEqual(['MISSING_FIFO', 'MISSING_PRICE', 'CURRENCY_MISMATCH', 'INCONSISTENT_LOTS'])
    const query = asObject(schemas.GetPortfolioAssetPerformanceDto)
    expect(query.required ?? []).toEqual([])
    expect(asObject(asObject(query.properties).accountId).format).toBe('uuid')

    const route = asObject(asObject(committed.paths)['/portfolio/performance/assets'])
    const operation = asObject(route.get)
    const parameters = operation.parameters as Array<{ name: string; required: boolean }>
    expect(parameters.find(parameter => parameter.name === 'accountId')?.required).toBe(false)
    const ok = asObject(asObject(operation.responses)['200'])
    const schema = asObject(asObject(asObject(ok.content)['application/json']).schema)
    expect(schema.$ref).toBe('#/components/schemas/PortfolioAssetPerformanceResponseDto')
  })

  it('exports the annual realized route as decimal strings grouped by year and currency', () => {
    const schemas = asObject(asObject(committed.components).schemas)
    const item = asObject(schemas.PortfolioAnnualRealizedItemResponseDto)
    const properties = asObject(item.properties)
    expect(asObject(properties.year).type).toBe('integer')
    expect(asObject(properties.sellCount).type).toBe('integer')
    for (const key of ['netProceeds', 'disposedCost', 'realizedNetPnl']) {
      expect(asObject(properties[key]).type).toBe('string')
    }
    expect(asObject(properties.disposedCost).nullable).toBe(true)
    expect(asObject(properties.realizedNetPnl).nullable).toBe(true)
    expect(asObject(schemas.PortfolioAnnualRealizedIssue).enum).toEqual(['MISSING_FIFO'])
    const response = asObject(schemas.PortfolioAnnualRealizedResponseDto)
    expect(asObject(asObject(response.properties).timeZone).example).toBe('Asia/Taipei')

    const route = asObject(asObject(committed.paths)['/portfolio/performance/annual-realized'])
    const operation = asObject(route.get)
    const parameters = operation.parameters as Array<{ name: string; required: boolean }>
    expect(parameters.find(parameter => parameter.name === 'accountId')?.required).toBe(false)
    const ok = asObject(asObject(operation.responses)['200'])
    const schema = asObject(asObject(asObject(ok.content)['application/json']).schema)
    expect(schema.$ref).toBe('#/components/schemas/PortfolioAnnualRealizedResponseDto')
  })

  it('exports annual buy amounts as decimal strings grouped by asset type', () => {
    const schemas = asObject(asObject(committed.components).schemas)
    const item = asObject(schemas.PortfolioAnnualBuyItemResponseDto)
    const properties = asObject(item.properties)
    for (const key of ['buyAmount', 'sellNetProceeds', 'buyMinusSellProceeds']) {
      expect(asObject(properties[key]).type).toBe('string')
    }
    expect(asObject(schemas.PortfolioAnnualBuyAssetType).enum).toEqual(['equity', 'etf', 'crypto', 'cash', 'other'])
    const typeRow = asObject(schemas.PortfolioAnnualBuyTypeResponseDto)
    expect(asObject(asObject(typeRow.properties).share).nullable).toBe(true)
    const response = asObject(schemas.PortfolioAnnualBuysResponseDto)
    expect(asObject(asObject(response.properties).timeZone).example).toBe('Asia/Taipei')

    const route = asObject(asObject(committed.paths)['/portfolio/performance/annual-buys'])
    const operation = asObject(route.get)
    const parameters = operation.parameters as Array<{ name: string; required: boolean }>
    expect(parameters.find(parameter => parameter.name === 'accountId')?.required).toBe(false)
    const ok = asObject(asObject(operation.responses)['200'])
    const schema = asObject(asObject(asObject(ok.content)['application/json']).schema)
    expect(schema.$ref).toBe('#/components/schemas/PortfolioAnnualBuysResponseDto')
  })

  it('exports realized period, asset, and trade reads as decimal strings', () => {
    const schemas = asObject(asObject(committed.components).schemas)
    const summary = asObject(schemas.PortfolioRealizedMoneySummaryDto)
    const summaryProperties = asObject(summary.properties)
    expect(asObject(summaryProperties.sellCount).type).toBe('integer')
    for (const key of ['netProceeds', 'disposedCost', 'realizedNetPnl']) {
      expect(asObject(summaryProperties[key]).type).toBe('string')
    }
    expect(asObject(summaryProperties.disposedCost).nullable).toBe(true)
    expect(asObject(schemas.PortfolioRealizedPeriodIssue).enum).toEqual(['MISSING_FIFO'])

    const asset = asObject(schemas.PortfolioRealizedAssetItemDto)
    expect(asObject(asObject(asset.properties).realizedQuantity).nullable).toBe(true)
    const trade = asObject(schemas.PortfolioRealizedTradeItemDto)
    expect(asObject(asObject(trade.properties).quantity).nullable).toBe(true)
    expect(asObject(asObject(trade.properties).price).nullable).toBe(true)
    expect(asObject(asObject(trade.properties).type).enum).toEqual(['sell'])

    for (const [path, schemaName, required] of [
      ['/portfolio/performance/realized/periods', 'PortfolioRealizedPeriodsResponseDto', ['year']],
      ['/portfolio/performance/realized/assets', 'PortfolioRealizedAssetsResponseDto', ['year', 'currency']],
      ['/portfolio/performance/realized/trades', 'PortfolioRealizedTradesResponseDto', ['year', 'currency', 'assetId']],
    ] as const) {
      const operation = asObject(asObject(asObject(committed.paths)[path]).get)
      const parameters = operation.parameters as Array<{ name: string; required: boolean }>
      for (const name of required) {
        expect(parameters.find(parameter => parameter.name === name)?.required).toBe(true)
      }
      expect(parameters.find(parameter => parameter.name === 'accountId')?.required).toBe(false)
      const ok = asObject(asObject(operation.responses)['200'])
      const schema = asObject(asObject(asObject(ok.content)['application/json']).schema)
      expect(schema.$ref).toBe(`#/components/schemas/${schemaName}`)
    }
  })

  it('exports annual external funding without treating unknown cash as a complete total', () => {
    const schemas = asObject(asObject(committed.components).schemas)
    const item = asObject(schemas.PortfolioAnnualExternalFundingItemResponseDto)
    const properties = asObject(item.properties)
    for (const key of ['externalDeposit', 'externalWithdrawal', 'recordedNetContribution']) {
      expect(asObject(properties[key]).type).toBe('string')
      expect(asObject(properties[key]).nullable).toBe(true)
    }
    expect(asObject(schemas.AnnualExternalFundingCoverage).enum).toEqual(['not_recorded', 'partial', 'complete'])
    expect(asObject(schemas.AnnualExternalFundingIssue).enum).toEqual(['UNKNOWN_CASHFLOW', 'COVERAGE_UNCONFIRMED'])

    const route = asObject(asObject(committed.paths)['/portfolio/performance/annual-external-funding'])
    const operation = asObject(route.get)
    const parameters = operation.parameters as Array<{ name: string; required: boolean }>
    expect(parameters.find(parameter => parameter.name === 'accountId')?.required).toBe(false)
    const ok = asObject(asObject(operation.responses)['200'])
    const schema = asObject(asObject(asObject(ok.content)['application/json']).schema)
    expect(schema.$ref).toBe('#/components/schemas/PortfolioAnnualExternalFundingResponseDto')
  })
})
