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

  it('exports CP0 asset-performance schemas without registering a placeholder route', () => {
    const schemas = asObject(asObject(committed.components).schemas)
    const item = asObject(schemas.PortfolioAssetPerformanceItemResponseDto)
    const properties = asObject(item.properties)
    const required = item.required as string[]
    expect(required.slice().sort()).toEqual(Object.keys(properties).sort())
    for (const key of ['quantity', 'realizedNetPnl', 'remainingCost', 'latestPrice', 'unrealizedPnl', 'tradeNetPnl', 'recordedDividendAmount']) {
      expect(asObject(properties[key]).type).toBe('string')
    }
    for (const key of ['realizedNetPnl', 'remainingCost', 'latestPrice', 'priceAsOf', 'priceSource', 'unrealizedPnl', 'tradeNetPnl', 'recordedDividendAmount', 'firstBuyAt']) {
      expect(asObject(properties[key]).nullable).toBe(true)
    }
    expect(asObject(properties.recordedDividendCount).type).toBe('integer')
    expect(asObject(schemas.PortfolioAssetPerformanceStatus).enum).toEqual(['holding', 'closed'])
    expect(asObject(schemas.PortfolioAssetPerformanceIssue).enum).toEqual(['MISSING_FIFO', 'MISSING_PRICE', 'CURRENCY_MISMATCH', 'INCONSISTENT_LOTS'])
    const query = asObject(schemas.GetPortfolioAssetPerformanceDto)
    expect(query.required ?? []).toEqual([])
    expect(asObject(asObject(query.properties).accountId).format).toBe('uuid')
    expect(asObject(committed.paths)['/portfolio/performance/assets']).toBeUndefined()
  })
})
