import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { FX_RATE_PROVIDER, FxRatePoint, FxRateProvider } from './fx-rate.types'

type GetReferenceRateInput = {
  base: string
  quote: string
  asOf?: Date
  refresh?: boolean
}

type SyncReferenceRatesInput = {
  base: string
  quotes: string[]
  from: Date
  to?: Date
}

@Injectable()
export class FxRateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FX_RATE_PROVIDER) private readonly fxRateProvider: FxRateProvider,
  ) {}

  async getReferenceRate(input: GetReferenceRateInput): Promise<FxRatePoint> {
    const base = input.base.toUpperCase()
    const quote = input.quote.toUpperCase()
    const targetDate = this.toIsoDate(input.asOf ?? new Date())

    if (base === quote) {
      return {
        base,
        quote,
        rate: 1,
        date: targetDate,
        provider: 'identity',
      }
    }

    if (!input.refresh) {
      const storedRate = await this.prisma.fxRate.findFirst({
        where: {
          base,
          quote,
          asOf: {
            lte: this.toUtcDate(targetDate),
          },
        },
        orderBy: {
          asOf: 'desc',
        },
      })

      if (storedRate) {
        return {
          base: storedRate.base,
          quote: storedRate.quote,
          rate: Number(storedRate.rate),
          date: storedRate.asOf.toISOString().slice(0, 10),
          provider: 'db',
        }
      }
    }

    const [fetchedRate] = await this.fxRateProvider.getDailyReferenceRates({
      base,
      quotes: [quote],
      date: targetDate,
    })

    if (!fetchedRate) {
      throw new NotFoundException(`FX rate not found for ${base}/${quote} on ${targetDate}`)
    }

    await this.replaceStoredRates([fetchedRate])
    return fetchedRate
  }

  async syncReferenceRates(input: SyncReferenceRatesInput): Promise<FxRatePoint[]> {
    const base = input.base.toUpperCase()
    const quotes = [...new Set(input.quotes.map((quote) => quote.toUpperCase()))].filter(
      (quote) => quote !== base,
    )

    if (quotes.length === 0) {
      return []
    }

    const rates = await this.fxRateProvider.getDailyReferenceRates({
      base,
      quotes,
      from: this.toIsoDate(input.from),
      to: this.toIsoDate(input.to ?? input.from),
    })

    await this.replaceStoredRates(rates)
    return rates
  }

  private async replaceStoredRates(rates: FxRatePoint[]) {
    for (const rate of rates) {
      await this.prisma.fxRate.deleteMany({
        where: {
          base: rate.base,
          quote: rate.quote,
          asOf: this.toUtcDate(rate.date),
        },
      })

      await this.prisma.fxRate.create({
        data: {
          base: rate.base,
          quote: rate.quote,
          rate: rate.rate,
          asOf: this.toUtcDate(rate.date),
        },
      })
    }
  }

  private toIsoDate(value: Date): string {
    return value.toISOString().slice(0, 10)
  }

  private toUtcDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`)
  }
}
