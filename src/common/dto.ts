import { ApiProperty } from '@nestjs/swagger'

export class ErrorResponse {
  @ApiProperty({ example: 400 }) statusCode!: number
  @ApiProperty({ example: 'Bad Request' }) error!: string
  @ApiProperty({ example: 'Entry not balanced: debit=..., credit=...' }) message!: string
}

export class PageQuery {
  @ApiProperty({ example: 1, required: false }) page?: number
  @ApiProperty({ example: 20, required: false }) pageSize?: number
}

export class PageMeta {
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
}

export class Paged<T> {
  data!: T[]
  meta!: PageMeta
}
