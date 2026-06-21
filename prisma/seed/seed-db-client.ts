import { PrismaClient } from '@prisma/client'

/** Root Prisma client or interactive transaction client passed to seed helpers. */
export type SeedDbClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>
