import { BadGatewayException, Injectable } from '@nestjs/common'
import { FxRatePoint, FxRateProvider, FxRateQuery } from '../fx-rate.types'

type FrankfurterRateItem = {
  date: string
  base: string
  quote: string
  rate: number
}

@Injectable()
export class FrankfurterFxRateProvider implements FxRateProvider {
  readonly providerKey = 'frankfurter'

  private readonly apiBaseUrl =
    process.env.FRANKFURTER_API_BASE_URL ?? 'https://api.frankfurter.dev/v2'

  async getDailyReferenceRates(query: FxRateQuery): Promise<FxRatePoint[]> {
    const base = query.base.toUpperCase()
    const quotes = [...new Set(query.quotes.map((quote) => quote.toUpperCase()))]

    if (quotes.length === 0) {
      return []
    }

    const url = new URL('rates', this.ensureTrailingSlash(this.apiBaseUrl))
    url.searchParams.set('base', base)
    url.searchParams.set('quotes', quotes.join(','))

    if (query.date) {
      url.searchParams.set('date', query.date)
    }
    if (query.from) {
      url.searchParams.set('from', query.from)
    }
    if (query.to) {
      url.searchParams.set('to', query.to)
    }

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new BadGatewayException(
        `Frankfurter request failed with status ${response.status}`,
      )
    }

    const payload = (await response.json()) as unknown

    if (!Array.isArray(payload)) {
      throw new BadGatewayException('Unexpected Frankfurter response shape')
    }

    return payload.map((entry) => this.toFxRatePoint(entry))
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`
  }

  private toFxRatePoint(entry: unknown): FxRatePoint {
    const item = entry as FrankfurterRateItem

    if (
      !item ||
      typeof item.date !== 'string' ||
      typeof item.base !== 'string' ||
      typeof item.quote !== 'string' ||
      typeof item.rate !== 'number'
    ) {
      throw new BadGatewayException('Unexpected Frankfurter rate item')
    }

    return {
      base: item.base.toUpperCase(),
      quote: item.quote.toUpperCase(),
      rate: item.rate,
      date: item.date,
      provider: this.providerKey,
    }
  }
}
