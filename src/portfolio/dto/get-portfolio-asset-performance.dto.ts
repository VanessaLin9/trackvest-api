import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID } from 'class-validator'

/** CP0 contract; the read endpoint is implemented in CP1. */
export class GetPortfolioAssetPerformanceDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Optional account scope. The account must belong to the signed-in user, including when the caller is an admin.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string
}
