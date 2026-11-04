import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID } from 'class-validator'

export class GetPortfolioAnnualExternalFundingDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Optional account scope. The account must belong to the signed-in user, including when the caller is an admin. Internal transfers stay internal under this filter.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string
}
