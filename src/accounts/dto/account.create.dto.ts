import { ApiProperty } from '@nestjs/swagger'
import { IsUUID } from 'class-validator'
import { AccountBaseDto } from './account.base.dto'

export class CreateAccountDto extends AccountBaseDto {
    @ApiProperty({
        description: '擁有者使用者 ID（之後會從 JWT 取得，現階段先明傳）',
        example: '3f8b6bfa-8a0a-4e3c-9f1f-0f2a5af7b5a1',
    })
    @IsUUID()
    userId!: string
}
