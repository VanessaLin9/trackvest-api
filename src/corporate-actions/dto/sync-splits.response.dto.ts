import { ApiProperty } from '@nestjs/swagger'

export class SyncSplitsResponseDto {
  @ApiProperty({ enum: ['tw', 'us', 'all'] })
  market!: 'tw' | 'us' | 'all'

  @ApiProperty()
  assetsProcessed!: number

  @ApiProperty()
  eventsUpserted!: number

  @ApiProperty()
  applicationsCreated!: number

  @ApiProperty()
  applicationsSkipped!: number
}
