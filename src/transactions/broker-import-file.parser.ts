import { BadRequestException, Injectable } from '@nestjs/common'
import {
  BROKER_IMPORT_HEADER_LABELS,
  BrokerImportField,
  OPTIONAL_BROKER_IMPORT_FIELDS,
  REQUIRED_BROKER_IMPORT_FIELDS,
} from './broker-import-header.schema'

export type RawBrokerImportRow = {
  rowNumber: number
  assetName: string
  tradeDate: string
  quantity: string
  netAmount: string
  price: string
  fee: string
  tradeTax: string
  taxAmount: string
  brokerOrderNo: string
  currency: string
  note?: string
}

export type BrokerImportParseResult = {
  rows: RawBrokerImportRow[]
}

type HeaderIndexes = Record<BrokerImportField, number | undefined>

@Injectable()
export class BrokerImportFileParser {
  parse(csvContent: string): BrokerImportParseResult {
    const { headers, rows } = this.parseDelimitedRows(csvContent)
    const headerIndexes = this.resolveHeaderIndexes(headers)

    return {
      rows: rows.map((row) =>
        this.mapValuesToRawRow(row.rowNumber, row.values, headerIndexes),
      ),
    }
  }

  private parseDelimitedRows(csvContent: string) {
    const normalized = csvContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()
    if (!normalized) {
      throw new BadRequestException('CSV content is empty')
    }

    const lines = normalized
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV content must include a header row and at least one data row',
      )
    }

    const delimiter = this.detectDelimiter(lines[0])
    const headers = this.parseDelimitedLine(lines[0], delimiter)
    const rows = lines.slice(1).map((line, index) => ({
      rowNumber: index + 2,
      values: this.parseDelimitedLine(line, delimiter),
    }))

    return { headers, rows }
  }

  private detectDelimiter(headerLine: string): ',' | '\t' {
    const tabCount = headerLine.split('\t').length
    const commaCount = headerLine.split(',').length
    return tabCount > commaCount ? '\t' : ','
  }

  private parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]

      if (char === '"') {
        const next = line[index + 1]
        if (inQuotes && next === '"') {
          current += '"'
          index += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }

      if (char === delimiter && !inQuotes) {
        values.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    values.push(current.trim())
    return values
  }

  private resolveHeaderIndexes(headers: string[]): HeaderIndexes {
    const indexes = {} as HeaderIndexes

    for (const field of REQUIRED_BROKER_IMPORT_FIELDS) {
      const headerLabel = BROKER_IMPORT_HEADER_LABELS[field]
      const index = headers.indexOf(headerLabel)
      if (index === -1) {
        throw new BadRequestException(
          `Missing required import column: ${headerLabel}`,
        )
      }
      indexes[field] = index
    }

    for (const field of OPTIONAL_BROKER_IMPORT_FIELDS) {
      const headerLabel = BROKER_IMPORT_HEADER_LABELS[field]
      const index = headers.indexOf(headerLabel)
      indexes[field] = index === -1 ? undefined : index
    }

    return indexes
  }

  private mapValuesToRawRow(
    rowNumber: number,
    values: string[],
    headerIndexes: HeaderIndexes,
  ): RawBrokerImportRow {
    const readField = (field: Exclude<BrokerImportField, 'note'>): string =>
      values[headerIndexes[field]!]?.trim() ?? ''

    const noteIndex = headerIndexes.note
    const note =
      noteIndex === undefined
        ? undefined
        : values[noteIndex]?.trim() || undefined

    return {
      rowNumber,
      assetName: readField('assetName'),
      tradeDate: readField('tradeDate'),
      quantity: readField('quantity'),
      netAmount: readField('netAmount'),
      price: readField('price'),
      fee: readField('fee'),
      tradeTax: readField('tradeTax'),
      taxAmount: readField('taxAmount'),
      brokerOrderNo: readField('brokerOrderNo'),
      currency: readField('currency'),
      note,
    }
  }
}