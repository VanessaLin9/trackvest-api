export function toTradeDateUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

export function toTimeZoneIsoDate(value: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(value)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Failed to format date in timezone ${timeZone}`)
  }

  return `${year}-${month}-${day}`
}

export function shiftIsoDate(isoDate: string, dayOffset: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + dayOffset)
  return date.toISOString().slice(0, 10)
}

export function tradeTimeToIsoDate(tradeTime: Date, timeZone: string): string {
  return toTimeZoneIsoDate(tradeTime, timeZone)
}
