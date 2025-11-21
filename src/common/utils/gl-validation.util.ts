import { BadRequestException } from '@nestjs/common'
import { Currency } from '@prisma/client'

export type GlSide = 'debit' | 'credit'

export interface GlLineInput {
  glAccountId: string
  side: GlSide
  amount: number
  currency: Currency
  note?: string
}

/**
 * Validates that GL entry lines are balanced (total debits = total credits)
 * @throws BadRequestException if not balanced
 */
export function ensureBalanced(lines: GlLineInput[]): void {
  const debit = lines
    .filter((l) => l.side === 'debit')
    .reduce((sum, l) => sum + l.amount, 0)
  const credit = lines
    .filter((l) => l.side === 'credit')
    .reduce((sum, l) => sum + l.amount, 0)

  if (Math.abs(debit - credit) > 1e-6) {
    throw new BadRequestException(
      `Entry not balanced: debit=${debit}, credit=${credit}`,
    )
  }
}

/**
 * Validates that all GL entry lines use the same currency
 * @throws BadRequestException if currencies differ
 */
export function ensureSameCurrency(lines: GlLineInput[]): void {
  const currencies = new Set(lines.map((l) => l.currency))
  if (currencies.size !== 1) {
    throw new BadRequestException(
      'All lines must have the same currency (v1 rule).',
    )
  }
}

/**
 * Validates GL entry lines (balanced and same currency)
 * Convenience function that calls both validations
 */
export function validateGlLines(lines: GlLineInput[]): void {
  ensureBalanced(lines)
  ensureSameCurrency(lines)
}

/**
 * Calculate total debit amount from GL lines
 */
export function calculateTotalDebit(lines: GlLineInput[]): number {
  return lines
    .filter((l) => l.side === 'debit')
    .reduce((sum, l) => sum + l.amount, 0)
}

/**
 * Calculate total credit amount from GL lines
 */
export function calculateTotalCredit(lines: GlLineInput[]): number {
  return lines
    .filter((l) => l.side === 'credit')
    .reduce((sum, l) => sum + l.amount, 0)
}

