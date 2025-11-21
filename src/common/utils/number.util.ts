/**
 * Utility functions for number operations
 */

/**
 * Safely converts a value to a number
 * Returns 0 if value is null, undefined, or NaN
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0
  }
  const num = Number(value)
  return isNaN(num) ? 0 : num
}

/**
 * Safely converts a value to a number, throwing if invalid
 * @throws Error if value cannot be converted to a valid number
 */
export function toNumberStrict(value: unknown): number {
  if (value === null || value === undefined) {
    throw new Error('Value cannot be null or undefined')
  }
  const num = Number(value)
  if (isNaN(num)) {
    throw new Error(`Cannot convert "${value}" to number`)
  }
  return num
}

/**
 * Rounds a number to specified decimal places
 */
export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

/**
 * Checks if two numbers are approximately equal (within epsilon)
 */
export function isApproximatelyEqual(
  a: number,
  b: number,
  epsilon: number = 1e-6,
): boolean {
  return Math.abs(a - b) < epsilon
}

