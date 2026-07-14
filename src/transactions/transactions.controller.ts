import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { TransactionImportService } from './transaction-import.service'
import { TransactionsService } from './transactions.service'
import { FindTransactionsDto } from './dto/find-transaction.dto'
import { CreateTransactionDto } from './dto/create-transaction.dto'
import { CreateAndUpdateTransactionDto } from './dto/transaction.createAndUpdate.dto'
import { TransactionResponseDto } from './dto/transaction.response.dto'
import { ImportTransactionsDto } from './dto/import-transactions.dto'
import { ImportTransactionsResponseDto } from './dto/import-transactions.response.dto'
import { ImportPreviewResponseDto } from './dto/import-preview.response.dto'
import { ImportCommitResponseDto } from './dto/import-commit.response.dto'
import { ImportCommitRejectedResponseDto } from './dto/import-commit-rejected.response.dto'
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
  constructor(
    private readonly svc: TransactionsService,
    private readonly importService: TransactionImportService,
  ) {}

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
  @ApiOperation({
    deprecated: true,
    summary: 'Deprecated: use POST /transactions/import/preview then /transactions/import/commit',
    description:
      'Prefer preview + commit. This endpoint follows the same commit-time plan (ready-only chronological writes).',
  })
  @ApiCreatedResponse({ type: ImportTransactionsResponseDto })
  async importTransactions(
    @Body() dto: ImportTransactionsDto,
    @CurrentUser() userId: string,
  ): Promise<ImportTransactionsResponseDto> {
    return this.importService.importTransactions(dto, userId)
  }

  @Post('import/preview')
  @ApiOperation({
    summary: 'Preview broker CSV import',
    description:
      'Evaluates rows without writing. Applies chronological sell-readiness planning and returns typed row statuses. ' +
      'canCommit is true when there is at least one ready row and no commit-blocking error (file-internal duplicate), ' +
      'or when the upload is all-skipped. Sell codes SELL_HISTORY_REQUIRED, SELL_INSUFFICIENT_LOTS, and ' +
      'SELL_SAME_DAY_ORDER_AMBIGUOUS are row-local and do not block other ready rows.',
  })
  @ApiOkResponse({ type: ImportPreviewResponseDto })
  async previewImportTransactions(
    @Body() dto: ImportTransactionsDto,
    @CurrentUser() userId: string,
  ): Promise<ImportPreviewResponseDto> {
    return this.importService.previewImportTransactions(dto, userId)
  }

  @Post('import/commit')
  @ApiOperation({
    summary: 'Commit broker CSV import',
    description:
      'Re-evaluates the same plan as preview, then creates only ready rows in chronological write order. ' +
      'Error and skipped rows are not written. Unexpected create failures still return IMPORT_COMMIT_FAILED.',
  })
  @ApiCreatedResponse({ type: ImportCommitResponseDto })
  @ApiBadRequestResponse({ type: ImportCommitRejectedResponseDto })
  async commitImportTransactions(
    @Body() dto: ImportTransactionsDto,
    @CurrentUser() userId: string,
  ): Promise<ImportCommitResponseDto> {
    return this.importService.commitImportTransactions(dto, userId)
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
