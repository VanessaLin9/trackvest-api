import { Module } from '@nestjs/common'
import { FxModule } from '../fx/fx.module'
import { PortfolioController } from './portfolio.controller'
import { PortfolioHoldingsSnapshotService } from './portfolio-holdings-snapshot.service'
import { PortfolioService } from './portfolio.service'

@Module({
  imports: [FxModule],
  controllers: [PortfolioController],
  providers: [PortfolioHoldingsSnapshotService, PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
