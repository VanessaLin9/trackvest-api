// src/transactions/transactions.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { TransactionsService } from './transactions.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { CreateTransactionDto } from './dto/create-transaction.dto'

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Get()
  findAll(@Query() q: FindTransactionsDto) {
    return this.svc.findAll(q)
  }

  @Post()
  create(@Body() dto: CreateTransactionDto) {
    return this.svc.create(dto)
  }
}
