import { Global, Module } from '@nestjs/common'
import { OwnershipService } from './services/ownership.service'

@Global()
@Module({
  providers: [OwnershipService],
  exports: [OwnershipService],
})
export class CommonModule {}
