import { PartialType } from '@nestjs/swagger'
import { TransactionBaseDto } from './transaction.base.dto'

export class CreateAndUpdateTransactionDto extends PartialType(TransactionBaseDto) {}
