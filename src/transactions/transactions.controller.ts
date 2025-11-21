import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiCreatedResponse, ApiTags, ApiBadRequestResponse, ApiHeader } from '@nestjs/swagger'
import { TransactionsService } from './transactions.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'
import { TransactionResponseDto } from './dto/transaction.response.dto'
import { plainToInstance } from 'class-transformer'
import { ErrorResponse } from 'src/common/dto'
import { CurrentUser } from '../common/decorators/current-user.decorator'

@ApiTags('transactions')
@Controller('transactions')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiHeader({ name: 'X-User-Id', description: 'User ID', required: true })
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Post()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  async create(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() userId: string,
  ): Promise<TransactionResponseDto> {
    const created = await this.svc.create(dto, userId)
    return plainToInstance(TransactionResponseDto, created, { excludeExtraneousValues: true })
  }

  @Get()
  @ApiOkResponse({ type: TransactionResponseDto, isArray: true })
  async findAll(
    @Query() q: FindTransactionsDto,
    @CurrentUser() userId: string,
  ) {
    return this.svc.findAll(q, userId)
  }

  @Get(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.svc.findOne(id, userId)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }

  @Patch(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: CreateAndUpdateTransactionDto,
    @CurrentUser() userId: string,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.svc.update(id, dto, userId)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }

  @Delete(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  async remove(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.svc.remove(id, userId)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }

  @Delete(':id/hard')
  @ApiOkResponse({ type: TransactionResponseDto })
  async hardDelete(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.svc.hardDelete(id, userId)
    return plainToInstance(TransactionResponseDto, transaction, { excludeExtraneousValues: true })
  }
}
