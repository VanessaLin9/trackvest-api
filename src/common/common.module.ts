import { Global, Module } from '@nestjs/common'
import { OwnershipService } from './services/ownership.service'

/**
 * Shared services used across feature modules.
 *
 * Marked `@Global()` because `OwnershipService` is consumed by almost every
 * feature module; requiring each to import `CommonModule` would be noisy
 * and add no safety.
 */
@Global()
@Module({
  providers: [OwnershipService],
  exports: [OwnershipService],
})
export class CommonModule {}
