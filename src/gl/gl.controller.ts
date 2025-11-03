import { Body, Controller, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiProperty, ApiTags } from '@nestjs/swagger'
import { PostingService } from './posting.service'
import { Currency } from '@prisma/client'
import { ErrorResponse } from 'src/common/dto'
import { ExpenseBodyDto, IncomeBodyDto } from './dto/ledger.dto'

class TransferBody {
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' }) userId: string
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' }) fromGlAccountId: string
  @ApiProperty({ example: 'c2610e4e-1cca-401e-afa7-1ebf541d0000' }) toGlAccountId: string
  @ApiProperty({ example: 1000 }) amount: number
  @ApiProperty({ example: 'TWD' }) currency: Currency
  @ApiProperty({ example: '2025-01-01' }) date?: string
  @ApiProperty({ example: 'Transfer from account to account' }) memo?: string
}
@ApiTags('gl')
@Controller('gl')
@ApiBadRequestResponse({ type: ErrorResponse })
export class GlController {
  constructor(private readonly post: PostingService) {}

  @Post('transfer')
  @ApiBody({ type: TransferBody })
  @ApiCreatedResponse({ description: 'Created GL entry with two lines' })
  async transfer(@Body() body: TransferBody) {
    const date = body.date ? new Date(body.date) : new Date()
    return this.post.postTransfer(body.userId, {
      fromGlAccountId: body.fromGlAccountId,
      toGlAccountId: body.toGlAccountId,
      amount: Number(body.amount),
      currency: body.currency,
      date,
      memo: body.memo,
      source: 'manual:transfer',
    })
  }

  // POST /gl/expense
  @Post('expense')
  @ApiCreatedResponse({ description: 'Created GL entry for an expense (debit expense, credit cash/bank).' })
  @ApiBadRequestResponse({ description: 'Validation failed or not balanced.' })
  async expense(@Body() body: ExpenseBodyDto) {
    const date = body.date ? new Date(body.date) : new Date()
    return this.post.postExpense(body.userId, {
      payFromGlAccountId: body.payFromGlAccountId,
      expenseGlAccountId: body.expenseGlAccountId,
      amount: Number(body.amount),
      currency: body.currency as any,
      date,
      memo: body.memo,
      source: 'manual:expense',
    })
  }
  
  // POST /gl/income
  @Post('income')
  @ApiCreatedResponse({ description: 'Created GL entry for an income (debit cash/bank, credit income).' })
  @ApiBadRequestResponse({ description: 'Validation failed or not balanced.' })
  async income(@Body() body: IncomeBodyDto) {
    const date = body.date ? new Date(body.date) : new Date()
    return this.post.postIncome(body.userId, {
      receiveToGlAccountId: body.receiveToGlAccountId,
      incomeGlAccountId: body.incomeGlAccountId,
      amount: Number(body.amount),
      currency: body.currency as any,
      date,
      memo: body.memo,
      source: 'manual:income',
    })
  }
}
