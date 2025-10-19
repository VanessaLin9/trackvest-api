import { PartialType } from '@nestjs/swagger'
import { AccountBaseDto } from './account.base.dto'

export class UpdateAccountDto extends PartialType(AccountBaseDto) {}
