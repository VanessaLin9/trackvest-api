import { Body, Controller, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiProperty, ApiTags } from '@nestjs/swagger'
import { PostingService } from './posting.service'
import { Currency } from '@prisma/client'
import { ErrorResponse } from 'src/common/dto'

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
}
