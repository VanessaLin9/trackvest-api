import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiBadRequestResponse, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { TransactionsService } from './transactions.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'
import { TransactionResponseDto } from './dto/transaction.response.dto'
import { ImportTransactionsDto } from './dto/import-transactions.dto'
import { ImportTransactionsResponseDto } from './dto/import-transactions.response.dto'
import { ErrorResponse } from 'src/common/dto'
import { AuthUser } from '../common/decorators/auth-user.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Serialize } from '../common/interceptors/serialize.interceptor'
import { AuthenticatedUser } from '../common/types/auth-user'

@ApiTags('transactions')
@Controller('transactions')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiCookieAuth('access_token')
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Post()
  @ApiCreatedResponse({ type: TransactionResponseDto })
  @Serialize(TransactionResponseDto)
  async create(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() userId: string,
  ) {
    return this.svc.create(dto, userId)
  }

  @Post('import')
  @ApiCreatedResponse({ type: ImportTransactionsResponseDto })
  async importTransactions(
    @Body() dto: ImportTransactionsDto,
    @CurrentUser() userId: string,
  ): Promise<ImportTransactionsResponseDto> {
    return this.svc.importTransactions(dto, userId)
  }

  @Get()
  @ApiOkResponse({ type: TransactionResponseDto, isArray: true })
  async findAll(
    @Query() q: FindTransactionsDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.svc.findAll(q, user)
  }

  @Get(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  @Serialize(TransactionResponseDto)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    return this.svc.findOne(id, userId)
  }

  @Patch(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  @Serialize(TransactionResponseDto)
  async update(
    @Param('id') id: string,
    @Body() dto: CreateAndUpdateTransactionDto,
    @CurrentUser() userId: string,
  ) {
    return this.svc.update(id, dto, userId)
  }

  @Delete(':id')
  @ApiOkResponse({ type: TransactionResponseDto })
  @Serialize(TransactionResponseDto)
  async remove(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    return this.svc.remove(id, userId)
  }

  @Delete(':id/hard')
  @ApiOkResponse({ type: TransactionResponseDto })
  @Serialize(TransactionResponseDto)
  async hardDelete(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    return this.svc.hardDelete(id, userId)
  }
}
