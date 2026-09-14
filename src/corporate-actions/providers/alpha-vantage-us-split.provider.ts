import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  CorpActionMarket,
  SplitEvent,
  SplitEventProvider,
} from '../corp-action.types';

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** Explicit historical SPLITS events; adjusted-close changes also include dividends. */
@Injectable()
export class AlphaVantageUsSplitProvider implements SplitEventProvider {
  private static nextRequestAt = 0;
  readonly market: CorpActionMarket = 'us';
  readonly providerKey = 'alpha-vantage';
  // Price backfills request multiple windows for the same symbol. Reuse the full
  // history briefly to avoid spending provider quota once per window.
  private readonly histories = new Map<
    string,
    { fetchedAt: number; events: SplitEvent[] }
  >();

  async fetchSplitEvents(input: {
    stockId: string;
    startDate: string;
    endDate: string;
  }): Promise<SplitEvent[]> {
    const apiKey = process.env.ALPHAVANTAGE_API_KEY?.trim();
    if (!apiKey)
      throw new BadGatewayException('ALPHAVANTAGE_API_KEY is not configured');
    if (
      !isCalendarDate(input.startDate) ||
      !isCalendarDate(input.endDate) ||
      input.startDate > input.endDate
    ) {
      throw new BadRequestException(
        'Split dates must be YYYY-MM-DD with startDate <= endDate',
      );
    }
    if (!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(input.stockId)) {
      throw new BadRequestException('Invalid US stock symbol');
    }
    const endDate = [
      input.endDate,
      new Date().toISOString().slice(0, 10),
    ].sort()[0];
    const inWindow = (events: SplitEvent[]) =>
      events
        .filter(
          (event) => event.exDate >= input.startDate && event.exDate <= endDate,
        )
        .map((event) => ({ ...event }));
    const cached = this.histories.get(input.stockId);
    if (cached && Date.now() - cached.fetchedAt < 60_000)
      return inWindow(cached.events);
    // Free keys allow one request/second. Reserve slots across both Nest modules
    // in this process; daily quotas and other processes still fail explicitly.
    const now = performance.now();
    const waitMs = Math.max(0, AlphaVantageUsSplitProvider.nextRequestAt - now);
    AlphaVantageUsSplitProvider.nextRequestAt = now + waitMs + 1100;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const url = new URL('https://www.alphavantage.co/query');
    url.searchParams.set('function', 'SPLITS');
    url.searchParams.set('symbol', input.stockId);
    url.searchParams.set('apikey', apiKey);
    let payload: {
      symbol?: unknown;
      data?: unknown;
      Information?: unknown;
      Note?: unknown;
      'Error Message'?: unknown;
    };
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('HTTP failure');
      payload = await response.json();
    } catch {
      // Never expose a fetch error containing a URL with the API key.
      throw new BadGatewayException('Alpha Vantage split request failed');
    }
    if (
      !payload ||
      payload.Information ||
      payload.Note ||
      payload['Error Message']
    ) {
      const message = String(
        payload?.Information ||
          payload?.Note ||
          payload?.['Error Message'] ||
          '',
      );
      if (/rate|frequency|limit|quota/i.test(message)) {
        throw new BadGatewayException(
          'Alpha Vantage split request rate limit reached; retry when the provider quota resets',
        );
      }
      throw new BadGatewayException(
        'Alpha Vantage rejected the split request; check API quota and access',
      );
    }
    if (payload.symbol !== input.stockId || !Array.isArray(payload.data)) {
      throw new BadGatewayException('Invalid Alpha Vantage split response');
    }
    const events = new Map<string, SplitEvent>();
    for (const row of payload.data) {
      if (
        !row ||
        !isCalendarDate(row.effective_date) ||
        (typeof row.split_factor !== 'string' &&
          typeof row.split_factor !== 'number')
      ) {
        throw new BadGatewayException('Invalid Alpha Vantage split event');
      }
      const ratio = Number(row.split_factor);
      if (!Number.isFinite(ratio) || ratio <= 0)
        throw new BadGatewayException('Invalid Alpha Vantage split ratio');
      const exDate = row.effective_date;
      if (ratio === 1) continue;
      if (events.has(exDate) && events.get(exDate)!.ratio !== ratio) {
        throw new BadGatewayException('Conflicting Alpha Vantage split events');
      }
      events.set(exDate, {
        stockId: input.stockId,
        exDate,
        ratio,
        direction: ratio > 1 ? 'split' : 'reverse_split',
        sourceKey: `${input.stockId}:${exDate}`,
      });
    }
    const history = [...events.values()].sort((a, b) =>
      a.exDate.localeCompare(b.exDate),
    );
    this.histories.set(input.stockId, {
      fetchedAt: Date.now(),
      events: history,
    });
    return inWindow(history);
  }
}
