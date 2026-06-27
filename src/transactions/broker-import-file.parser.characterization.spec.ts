import { BadRequestException } from '@nestjs/common'
import { TransactionImportService } from './transaction-import.service'

type LegacyParserAccess = {
  parseCsvRows(csvContent: string): {
    headers: string[]
    rows: Array<{ rowNumber: number; values: string[] }>
  }
  getRequiredHeaderIndex(headers: string[], headerName: string): number
  detectDelimiter(headerLine: string): ',' | '\t'
  importHeaderMap: {
    note: string
  }
}

function createParserAccess(): LegacyParserAccess {
  return new TransactionImportService(
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as LegacyParserAccess
}

describe('Broker import file parser (characterization)', () => {
  const parser = createParserAccess()
  const headers = [
    '股名',
    '日期',
    '成交股數',
    '淨收付',
    '成交單價',
    '手續費',
    '交易稅',
    '稅款',
    '委託書號',
    '幣別',
    '備註',
  ]

  function buildTsvContent(dataRows: string[][]): string {
    return [
      headers.join('\t'),
      ...dataRows.map((row) => row.join('\t')),
    ].join('\n')
  }

  describe('parseCsvRows', () => {
    it('strips a UTF-8 BOM before parsing', () => {
      const content = `\uFEFF${buildTsvContent([
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', '整股'],
      ])}`

      const { headers: parsedHeaders, rows } = parser.parseCsvRows(content)

      expect(parsedHeaders[0]).toBe('股名')
      expect(rows).toHaveLength(1)
      expect(rows[0].values[0]).toBe('富邦台50')
    })

    it('normalizes CRLF line endings', () => {
      const content = buildTsvContent([
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', '整股'],
      ]).replace(/\n/g, '\r\n')

      const { rows } = parser.parseCsvRows(content)

      expect(rows).toHaveLength(1)
      expect(rows[0].rowNumber).toBe(2)
    })

    it('skips blank lines while preserving row numbers', () => {
      const content = [
        headers.join('\t'),
        '',
        '   ',
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', '第一筆'].join('\t'),
        '',
        ['元大高股息', '2026/03/25', '5', '520', '104', '5', '1', '0', 'BRK-002', 'TWD', '第二筆'].join('\t'),
      ].join('\n')

      const { rows } = parser.parseCsvRows(content)

      expect(rows).toEqual([
        {
          rowNumber: 2,
          values: expect.arrayContaining(['富邦台50', 'BRK-001', '第一筆']),
        },
        {
          rowNumber: 3,
          values: expect.arrayContaining(['元大高股息', 'BRK-002', '第二筆']),
        },
      ])
    })

    it('parses comma-delimited CSV rows', () => {
      const content = [
        headers.join(','),
        '富邦台50,2026/03/24,10,-1015,100,10,3,2,BRK-COMMA-001,TWD,逗號分隔',
      ].join('\n')

      const { rows } = parser.parseCsvRows(content)

      expect(rows[0].values).toEqual([
        '富邦台50',
        '2026/03/24',
        '10',
        '-1015',
        '100',
        '10',
        '3',
        '2',
        'BRK-COMMA-001',
        'TWD',
        '逗號分隔',
      ])
    })

    it('parses quoted fields containing the delimiter', () => {
      const note = '整股,含逗號'
      const content = [
        headers.join(','),
        `富邦台50,2026/03/24,10,-1015,100,10,3,2,BRK-QUOTED-001,TWD,"${note}"`,
      ].join('\n')

      const { rows } = parser.parseCsvRows(content)

      expect(rows[0].values.at(-1)).toBe(note)
    })

    it('parses escaped quotes inside quoted fields', () => {
      const content = [
        headers.join(','),
        '富邦台50,2026/03/24,10,-1015,100,10,3,2,BRK-ESCAPED-001,TWD,"含""引號""欄位"',
      ].join('\n')

      const { rows } = parser.parseCsvRows(content)

      expect(rows[0].values.at(-1)).toBe('含"引號"欄位')
    })

    it('rejects empty file content', () => {
      expect(() => parser.parseCsvRows('   ')).toThrow(BadRequestException)
      expect(() => parser.parseCsvRows('   ')).toThrow('CSV content is empty')
    })

    it('rejects content with only a header row', () => {
      expect(() => parser.parseCsvRows(headers.join('\t'))).toThrow(
        BadRequestException,
      )
      expect(() => parser.parseCsvRows(headers.join('\t'))).toThrow(
        'CSV content must include a header row and at least one data row',
      )
    })

    it('assigns row numbers starting at 2 for the first data row', () => {
      const content = buildTsvContent([
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', '第一筆'],
        ['元大高股息', '2026/03/25', '5', '520', '104', '5', '1', '0', 'BRK-002', 'TWD', '第二筆'],
      ])

      const { rows } = parser.parseCsvRows(content)

      expect(rows.map((row) => row.rowNumber)).toEqual([2, 3])
    })
  })

  describe('header validation', () => {
    it('throws when a required header is missing', () => {
      const parsedHeaders = headers.filter((header) => header !== '委託書號')

      expect(() =>
        parser.getRequiredHeaderIndex(parsedHeaders, '委託書號'),
      ).toThrow(BadRequestException)
      expect(() =>
        parser.getRequiredHeaderIndex(parsedHeaders, '委託書號'),
      ).toThrow('Missing required import column: 委託書號')
    })

    it('treats the note header as optional', () => {
      const parsedHeaders = headers.filter((header) => header !== '備註')
      const noteIndex = parsedHeaders.indexOf(parser.importHeaderMap.note)

      expect(noteIndex).toBe(-1)
    })
  })

  describe('detectDelimiter', () => {
    it('prefers tab delimiters when tabs outnumber commas', () => {
      expect(parser.detectDelimiter(headers.join('\t'))).toBe('\t')
    })

    it('prefers comma delimiters when commas outnumber tabs', () => {
      expect(parser.detectDelimiter(headers.join(','))).toBe(',')
    })
  })
})
