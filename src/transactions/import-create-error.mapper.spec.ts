import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { mapImportCreateError } from './import-create-error.mapper'

describe('mapImportCreateError', () => {
  it('maps P2002 to a duplicate broker order row error', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    })

    expect(mapImportCreateError(error, 2)).toEqual({
      row: 2,
      field: '委託書號',
      message: 'Duplicate broker order number for selected account',
    })
  })

  it('maps known errors to row-level messages', () => {
    expect(
      mapImportCreateError(new BadRequestException('Amount must be a positive number'), 2),
    ).toEqual({
      row: 2,
      field: 'row',
      message: 'Amount must be a positive number',
    })
  })

  it('falls back to a generic message for unknown thrown values', () => {
    expect(mapImportCreateError('unexpected', 2)).toEqual({
      row: 2,
      field: 'row',
      message: 'Failed to import row',
    })
  })
})
