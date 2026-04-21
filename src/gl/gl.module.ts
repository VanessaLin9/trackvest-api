import { Module } from '@nestjs/common'
import { GlController } from './gl.controller'
import { PostingService } from './posting.service'
import { GlService } from './services/gl.service'

@Module({
  controllers: [GlController],
  providers: [GlService, PostingService],
  exports: [GlService, PostingService],
})
export class GlModule {}
