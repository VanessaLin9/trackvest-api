import { Body, Controller, Post, BadRequestException, Get, Query } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiTags, ApiHeader, ApiResponse } from '@nestjs/swagger'
import { PostingService } from './posting.service'
import { ErrorResponse } from 'src/common/dto'
import { PostTransferCommand } from './dto/post-transfer.command'
import { PostExpenseCommand } from './dto/post-expense.command'
import { PostIncomeCommand } from './dto/post-income.command'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { OwnershipService } from '../common/services/ownership.service'
import { GlAccountLookupService } from './services/gl-account-lookup.service'
import { GlAccountType } from '@prisma/client'
import { GetAccountDto } from './dto/get-account.dto'

@ApiTags('gl')
@Controller('gl')
@ApiBadRequestResponse({ type: ErrorResponse })
@ApiHeader({ name: 'X-User-Id', description: 'User ID', required: true })
export class GlController {
  constructor(
    private readonly post: PostingService,
    private readonly ownershipService: OwnershipService,
    private readonly glAccountLookup: GlAccountLookupService,
  ) {}
  
  @Get('accounts')
  @ApiResponse({ type: [GetAccountDto] })
  async getAccounts(@CurrentUser() userId: string, @Query('type') type: GlAccountType) {
    if (!userId) {
      throw new BadRequestException('User ID is required')
    }
    if (!type) {
      throw new BadRequestException('Type is required')
    }
    return this.glAccountLookup.findByTypeAndName(userId, type)
  }

  @Post('transfer')
  @ApiBody({ type: PostTransferCommand })
  @ApiCreatedResponse({ description: 'Created GL entry with two lines' })
  async transfer(
    @Body() command: PostTransferCommand,
    @CurrentUser() userId: string,
  ) {
    // Validate userId matches authenticated user (unless admin)
    const isAdmin = await this.ownershipService.isAdmin(userId)
    if (!isAdmin && command.userId !== userId) {
      throw new BadRequestException('User ID mismatch')
    }
    
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

  // POST /gl/expense
  @Post('expense')
  @ApiBody({ type: PostExpenseCommand })
  @ApiCreatedResponse({ description: 'Created GL entry for an expense (debit expense, credit cash/bank).' })
  @ApiBadRequestResponse({ description: 'Validation failed or not balanced.' })
  async expense(
    @Body() command: PostExpenseCommand,
    @CurrentUser() userId: string,
  ) {
    // Validate userId matches authenticated user (unless admin)
    const isAdmin = await this.ownershipService.isAdmin(userId)
    if (!isAdmin && command.userId !== userId) {
      throw new BadRequestException('User ID mismatch')
    }
    
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
  
  // POST /gl/income
  @Post('income')
  @ApiBody({ type: PostIncomeCommand })
  @ApiCreatedResponse({ description: 'Created GL entry for an income (debit cash/bank, credit income).' })
  @ApiBadRequestResponse({ description: 'Validation failed or not balanced.' })
  async income(
    @Body() command: PostIncomeCommand,
    @CurrentUser() userId: string,
  ) {
    // Validate userId matches authenticated user (unless admin)
    const isAdmin = await this.ownershipService.isAdmin(userId)
    if (!isAdmin && command.userId !== userId) {
      throw new BadRequestException('User ID mismatch')
    }
    
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
