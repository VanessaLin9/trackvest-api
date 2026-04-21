import { Body, Controller, Post, BadRequestException, Get, Query } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PostingService } from './posting.service'
import { ErrorResponse } from 'src/common/dto'
import { PostTransferCommand } from './dto/post-transfer.command'
import { PostExpenseCommand } from './dto/post-expense.command'
import { PostIncomeCommand } from './dto/post-income.command'
import { AuthUser } from '../common/decorators/auth-user.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { OwnershipService } from '../common/services/ownership.service'
import { AuthenticatedUser } from '../common/types/auth-user'
import { ALL_GL_ACCOUNTS, GlService } from './services/gl.service'
import { GlAccountType } from '@prisma/client'
import { GetAccountDto } from './dto/get-account.dto'
import { GlEntryDto } from './dto/get-entry.dto'

@ApiTags('gl')
@Controller('gl')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiCookieAuth('access_token')
export class GlController {
  constructor(
    private readonly post: PostingService,
    private readonly ownershipService: OwnershipService,
    private readonly glService: GlService,
  ) {}

  @Get('accounts')
  @ApiResponse({ type: [GetAccountDto] })
  async getAccounts(@CurrentUser() userId: string, @Query('type') type: GlAccountType) {
    if (!type) {
      throw new BadRequestException('Type is required')
    }
    return this.glService.findByType(userId, type)
  }

  @Get('entries')
  @ApiResponse({ type: [GlEntryDto] })
  async getEntries(
    @CurrentUser() userId: string,
    @Query('accountId') accountParam: string = ALL_GL_ACCOUNTS,
  ) {
    return this.glService.getEntriesByAccountId(userId, accountParam)
  }

  @Post('transfer')
  @ApiBody({ type: PostTransferCommand })
  @ApiCreatedResponse({ description: 'Created GL entry with two lines' })
  async transfer(
    @Body() command: PostTransferCommand,
    @AuthUser() user: AuthenticatedUser,
  ) {
    this.ownershipService.assertSameUserOrAdmin(command.userId, user)

    const date = command.date ? new Date(command.date) : new Date()
    return this.post.postTransfer({
      userId: command.userId,
      fromGlAccountId: command.fromGlAccountId,
      toGlAccountId: command.toGlAccountId,
      amount: command.amount,
      currency: command.currency,
      date,
      memo: command.memo,
      source: command.source ?? 'manual:transfer',
    })
  }

  @Post('expense')
  @ApiBody({ type: PostExpenseCommand })
  @ApiCreatedResponse({ description: 'Created GL entry for an expense (debit expense, credit cash/bank).' })
  @ApiBadRequestResponse({ description: 'Validation failed or not balanced.' })
  async expense(
    @Body() command: PostExpenseCommand,
    @AuthUser() user: AuthenticatedUser,
  ) {
    this.ownershipService.assertSameUserOrAdmin(command.userId, user)

    const date = command.date ? new Date(command.date) : new Date()
    return this.post.postExpense({
      userId: command.userId,
      payFromGlAccountId: command.payFromGlAccountId,
      expenseGlAccountId: command.expenseGlAccountId,
      amount: command.amount,
      currency: command.currency,
      date,
      memo: command.memo,
      source: command.source ?? 'manual:expense',
    })
  }

  @Post('income')
  @ApiBody({ type: PostIncomeCommand })
  @ApiCreatedResponse({ description: 'Created GL entry for an income (debit cash/bank, credit income).' })
  @ApiBadRequestResponse({ description: 'Validation failed or not balanced.' })
  async income(
    @Body() command: PostIncomeCommand,
    @AuthUser() user: AuthenticatedUser,
  ) {
    this.ownershipService.assertSameUserOrAdmin(command.userId, user)

    const date = command.date ? new Date(command.date) : new Date()
    return this.post.postIncome({
      userId: command.userId,
      receiveToGlAccountId: command.receiveToGlAccountId,
      incomeGlAccountId: command.incomeGlAccountId,
      amount: command.amount,
      currency: command.currency,
      date,
      memo: command.memo,
      source: command.source ?? 'manual:income',
    })
  }
}
