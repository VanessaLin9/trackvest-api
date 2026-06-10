import { Module } from '@nestjs/common'
import { FxModule } from '../fx/fx.module'
import { PortfolioController } from './portfolio.controller'
import { PortfolioHoldingsSnapshotService } from './portfolio-holdings-snapshot.service'
import { PortfolioRebalanceService } from './portfolio-rebalance.service'
import { PortfolioService } from './portfolio.service'

@Module({
  imports: [FxModule],
  controllers: [PortfolioController],
  providers: [PortfolioHoldingsSnapshotService, PortfolioRebalanceService, PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
