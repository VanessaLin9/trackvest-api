import { Body, Controller, Post } from '@nestjs/common'
import { ApiBadRequestResponse, ApiTags } from '@nestjs/swagger'
import { PostingService } from './posting.service'
import { Currency } from '@prisma/client'
import { ErrorResponse } from 'src/common/dto'

@ApiTags('gl')
@Controller('gl')
@ApiBadRequestResponse({ type: ErrorResponse })
export class GlController {
  constructor(private readonly post: PostingService) {}

  @Post('transfer')
  async transfer(@Body() body: {
    userId: string,
    fromGlAccountId: string,
    toGlAccountId: string,
    amount: number,
    currency: Currency,
    date?: string,
    memo?: string
  }) {
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
