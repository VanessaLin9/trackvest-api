import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiCreatedResponse, ApiTags, ApiBadRequestResponse } from '@nestjs/swagger'
import { TransactionsService } from './transactions.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'
import { TransactionResponseDto } from './dto/transaction.response.dto'
import { plainToInstance } from 'class-transformer'
import { ErrorResponse } from 'src/common/dto'

@ApiTags('transactions')
@Controller('transactions')
@ApiBadRequestResponse({ type: ErrorResponse })
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Post()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  async create(@Body() dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    const created = await this.svc.create(dto)
    return plainToInstance(TransactionResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @ApiOkResponse({ type: TransactionResponseDto, isArray: true })
  async findAll(@Query() q: FindTransactionsDto) {
    return this.svc.findAll(q)
  }

  @Get(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  async findOne(@Param('id') id: string): Promise<TransactionResponseDto> {
    const transaction = await this.svc.findOne(id)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }

  @Patch(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  async update(@Param('id') id: string, @Body() dto: CreateAndUpdateTransactionDto): Promise<TransactionResponseDto> {
    const transaction = await this.svc.update(id, dto)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }

  @Delete(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  async remove(@Param('id') id: string): Promise<TransactionResponseDto> {
    const transaction = await this.svc.remove(id)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }

  @Delete(':id/hard')
  @ApiOkResponse({ type: TransactionResponseDto })
  async hardDelete(@Param('id') id: string): Promise<TransactionResponseDto> {
    const transaction = await this.svc.hardDelete(id)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }
}
