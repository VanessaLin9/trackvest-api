/**
 * Utility functions for date operations
 */

/**
 * Converts a date string or Date object to Date
 * Returns current date if value is null/undefined
 */
export function toDate(value: string | Date | null | undefined): Date {
  if (!value) {
    return new Date()
  }
  if (value instanceof Date) {
    return value
  }
  return new Date(value)
}

/**
 * Formats a date to ISO string
 */
export function toISOString(date: Date | string | null | undefined): string {
  if (!date) {
    return new Date().toISOString()
  }
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString()
}

/**
 * Checks if a date string is valid
 */
export function isValidDateString(value: string): boolean {
  const date = new Date(value)
  return !isNaN(date.getTime())
}

