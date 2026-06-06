import { ApiProperty } from '@nestjs/swagger'

export class SyncSplitsResponseDto {
  @ApiProperty({ enum: ['tw', 'us', 'all'] })
  market!: 'tw' | 'us' | 'all'

  @ApiProperty()
  assetsProcessed!: number

  @ApiProperty()
  eventsUpserted!: number

  @ApiProperty()
  scopesReplayed!: number

  @ApiProperty({
    description:
      'True when split events were stored but affected-scope replay has not run yet.',
  })
  replayPending!: boolean
}
