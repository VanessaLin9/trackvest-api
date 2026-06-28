import { BadRequestException } from '@nestjs/common'
import { BrokerImportFileParser } from './broker-import-file.parser'
import { BROKER_IMPORT_HEADER_LABELS } from './broker-import-header.schema'

describe('BrokerImportFileParser', () => {
  const parser = new BrokerImportFileParser()
  const headers = Object.values(BROKER_IMPORT_HEADER_LABELS)

  function buildTsvContent(dataRows: string[][]): string {
    return [
      headers.join('\t'),
      ...dataRows.map((row) => row.join('\t')),
    ].join('\n')
  }

  describe('parse', () => {
    it('strips a UTF-8 BOM before parsing', () => {
      const content = `\uFEFF${buildTsvContent([
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', '整股'],
      ])}`

      const { rows } = parser.parse(content)

      expect(rows).toHaveLength(1)
      expect(rows[0].assetName).toBe('富邦台50')
    })

    it('normalizes CRLF line endings', () => {
      const content = buildTsvContent([
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', '整股'],
      ]).replace(/\n/g, '\r\n')

      const { rows } = parser.parse(content)

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

      const { rows } = parser.parse(content)

      expect(rows.map((row) => row.rowNumber)).toEqual([2, 3])
      expect(rows[0].brokerOrderNo).toBe('BRK-001')
      expect(rows[1].brokerOrderNo).toBe('BRK-002')
    })

    it('parses comma-delimited CSV rows into typed raw values', () => {
      const content = [
        headers.join(','),
        '富邦台50,2026/03/24,10,-1015,100,10,3,2,BRK-COMMA-001,TWD,逗號分隔',
      ].join('\n')

      const { rows } = parser.parse(content)

      expect(rows[0]).toEqual({
        rowNumber: 2,
        assetName: '富邦台50',
        tradeDate: '2026/03/24',
        quantity: '10',
        netAmount: '-1015',
        price: '100',
        fee: '10',
        tradeTax: '3',
        taxAmount: '2',
        brokerOrderNo: 'BRK-COMMA-001',
        currency: 'TWD',
        note: '逗號分隔',
      })
    })

    it('parses quoted fields containing the delimiter', () => {
      const note = '整股,含逗號'
      const content = [
        headers.join(','),
        `富邦台50,2026/03/24,10,-1015,100,10,3,2,BRK-QUOTED-001,TWD,"${note}"`,
      ].join('\n')

      const { rows } = parser.parse(content)

      expect(rows[0].note).toBe(note)
    })

    it('parses escaped quotes inside quoted fields', () => {
      const content = [
        headers.join(','),
        '富邦台50,2026/03/24,10,-1015,100,10,3,2,BRK-ESCAPED-001,TWD,"含""引號""欄位"',
      ].join('\n')

      const { rows } = parser.parse(content)

      expect(rows[0].note).toBe('含"引號"欄位')
    })

    it('rejects empty file content', () => {
      expect(() => parser.parse('   ')).toThrow(BadRequestException)
      expect(() => parser.parse('   ')).toThrow('CSV content is empty')
    })

    it('rejects content with only a header row', () => {
      expect(() => parser.parse(headers.join('\t'))).toThrow(BadRequestException)
      expect(() => parser.parse(headers.join('\t'))).toThrow(
        'CSV content must include a header row and at least one data row',
      )
    })

    it('assigns row numbers starting at 2 for the first data row', () => {
      const content = buildTsvContent([
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', '第一筆'],
        ['元大高股息', '2026/03/25', '5', '520', '104', '5', '1', '0', 'BRK-002', 'TWD', '第二筆'],
      ])

      const { rows } = parser.parse(content)

      expect(rows.map((row) => row.rowNumber)).toEqual([2, 3])
    })

    it('throws when a required header is missing', () => {
      const content = [
        headers.filter((header) => header !== '委託書號').join('\t'),
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'TWD', '漏欄位'].join('\t'),
      ].join('\n')

      expect(() => parser.parse(content)).toThrow(BadRequestException)
      expect(() => parser.parse(content)).toThrow(
        'Missing required import column: 委託書號',
      )
    })

    it('leaves note undefined when the optional header is absent', () => {
      const content = [
        headers.filter((header) => header !== '備註').join('\t'),
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD'].join('\t'),
      ].join('\n')

      const { rows } = parser.parse(content)

      expect(rows[0].note).toBeUndefined()
    })

    it('leaves note undefined when the optional cell is blank', () => {
      const content = buildTsvContent([
        ['富邦台50', '2026/03/24', '10', '-1015', '100', '10', '3', '2', 'BRK-001', 'TWD', ''],
      ])

      const { rows } = parser.parse(content)

      expect(rows[0].note).toBeUndefined()
    })
  })
})
