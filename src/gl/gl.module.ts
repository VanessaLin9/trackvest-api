import { Module } from '@nestjs/common'
import { GlController } from './gl.controller'
import { DefaultChartProvisioningService } from './default-chart/default-chart-provisioning.service'
import { PostingService } from './posting.service'
import { GlService } from './services/gl.service'

@Module({
  controllers: [GlController],
  providers: [GlService, PostingService, DefaultChartProvisioningService],
  exports: [GlService, PostingService, DefaultChartProvisioningService],
})
export class GlModule {}
