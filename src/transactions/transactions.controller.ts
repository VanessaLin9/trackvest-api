// src/transactions/transactions.controller.ts
import { Controller, Get, Query } from '@nestjs/common'
import { TransactionsService } from './transactions.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Get()
  findAll(@Query() q: FindTransactionsDto) {
    return this.svc.findAll(q)
  }
}
