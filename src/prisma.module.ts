import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/**
 * Prisma is a cross-cutting dependency for every feature module.
 * Marking this module as `@Global()` avoids repeating the import everywhere.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
