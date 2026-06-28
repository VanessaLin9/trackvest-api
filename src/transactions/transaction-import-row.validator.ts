import { Injectable } from '@nestjs/common'
import { RawBrokerImportRow } from './broker-import-file.parser'
import {
  importRowFailure,
  ImportRowValidationResult,
  IMPORT_ROW_FIELD_LABELS,
  NormalizedImportTransactionRow,
} from './transaction-import-row.types'

@Injectable()
export class TransactionImportRowValidator {
  validateAndMap(raw: RawBrokerImportRow): ImportRowValidationResult {
    if (!raw.assetName) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.assetName,
        'Asset name is required',
      )
    }

    const tradeDate = this.parseDateField(raw.tradeDate)
    if (!tradeDate) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.tradeDate,
        'Trade date is invalid',
      )
    }

    const quantity = this.parseNumberField(raw.quantity, Number.NaN)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.quantity,
        'Quantity must be a positive number',
      )
    }

    const netAmount = this.parseNumberField(raw.netAmount, Number.NaN)
    if (!Number.isFinite(netAmount) || netAmount === 0) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.netAmount,
        'Net settlement cannot be zero',
      )
    }

    const price = this.parseNumberField(raw.price, Number.NaN)
    if (!Number.isFinite(price) || price <= 0) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.price,
        'Price must be a positive number',
      )
    }

    const fee = this.parseNumberField(raw.fee, Number.NaN)
    if (!Number.isFinite(fee) || fee < 0) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.fee,
        'Fee must be zero or a positive number',
      )
    }

    const tradeTax = this.parseNumberField(raw.tradeTax, Number.NaN)
    if (!Number.isFinite(tradeTax) || tradeTax < 0) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.tradeTax,
        'Trade tax must be zero or a positive number',
      )
    }

    const taxAmount = this.parseNumberField(raw.taxAmount, Number.NaN)
    if (!Number.isFinite(taxAmount) || taxAmount < 0) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.taxAmount,
        'Tax amount must be zero or a positive number',
      )
    }

    if (!raw.brokerOrderNo) {
      return importRowFailure(
        raw.rowNumber,
        IMPORT_ROW_FIELD_LABELS.brokerOrderNo,
        'Broker order number is required',
      )
    }

    return {
      ok: true,
      row: this.mapNormalizedRow(raw, {
        quantity,
        netAmount,
        price,
        fee,
        tradeTax,
        taxAmount,
        tradeDate,
      }),
    }
  }

  private mapNormalizedRow(
    raw: RawBrokerImportRow,
    fields: {
      quantity: number
      netAmount: number
      price: number
      fee: number
      tradeTax: number
      taxAmount: number
      tradeDate: Date
    },
  ): NormalizedImportTransactionRow {
    const type = fields.netAmount < 0 ? 'buy' : 'sell'

    return {
      rowNumber: raw.rowNumber,
      assetName: raw.assetName,
      type,
      amount: Math.abs(fields.netAmount),
      quantity: fields.quantity,
      price: fields.price,
      fee: fields.fee,
      tax: fields.tradeTax + fields.taxAmount,
      brokerOrderNo: raw.brokerOrderNo,
      currency: raw.currency,
      tradeTime: fields.tradeDate.toISOString(),
      note: raw.note,
    }
  }

  private parseNumberField(value: string | undefined, defaultValue = 0): number {
    if (value === undefined || value === '') {
      return defaultValue
    }

    const normalized = value.replace(/,/g, '')
    const numeric = Number(normalized)
    return Number.isFinite(numeric) ? numeric : Number.NaN
  }

  private parseDateField(value: string): Date | null {
    if (!value) {
      return null
    }

    const normalized = value.replace(/\//g, '-')
    const date = new Date(`${normalized}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }
}
